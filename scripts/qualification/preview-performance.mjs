import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, extname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { makeQuest, makeSnapshot } from '../../apps/preview/src/test/fixtures.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(resolve(root, 'apps/preview/package.json'));
const { chromium } = require('playwright');
const stage = resolve(root, 'dist/package');
const reportPath = resolve(
  root,
  process.argv[2] ?? 'artifacts/qualification/preview-performance.json',
);
const sizes = [500, 1000, 2000];
const seed = 0x51c0ffee;
const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
]);

if (process.platform !== 'linux') {
  throw new Error('Preview performance qualification requires Linux /proc RSS accounting');
}

function seededSnapshot(nodeCount) {
  const base = makeSnapshot();
  const columns = 40;
  const quests = Array.from({ length: nodeCount }, (_, index) =>
    makeQuest(
      `chapters/0/quests/${index}`,
      `scale.q${String(index).padStart(4, '0')}`,
      index % columns,
      Math.floor(index / columns),
    ),
  );
  let state = (seed ^ nodeCount) >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
  const edges = Array.from({ length: nodeCount * 2 }, (_, index) => {
    const sourceIndex = index % nodeCount;
    let targetIndex = random() % nodeCount;
    if (targetIndex === sourceIndex) targetIndex = (targetIndex + 1) % nodeCount;
    const source = quests[sourceIndex];
    const target = quests[targetIndex];
    return {
      controlPoints: null,
      hidden: false,
      id: `seed-${seed.toString(16)}-edge-${index}`,
      sourceInstanceId: source.instanceId,
      sourceLogicalKey: source.key,
      targetInstanceId: target.instanceId,
      targetLogicalKey: target.key,
    };
  });
  const rows = Math.ceil(nodeCount / columns);
  const chapter = {
    ...base.model.chapters[0],
    dependencyEdges: edges,
    dependencyReferences: [],
    fitBounds: {
      height: rows * 48 + 48,
      maxX: columns * 48,
      maxY: rows * 48,
      minX: -48,
      minY: -48,
      width: columns * 48 + 48,
    },
    quests,
  };
  return {
    ...base,
    model: {
      ...base.model,
      chapters: [chapter],
      graph: {
        availability: 'available',
        summary: {
          criticalPath: null,
          cycleComponents: [],
          edgeCount: edges.length,
          isolated: [],
          leaves: [],
          maximumDepth: null,
          nodeCount,
          roots: [],
          weakComponents: [],
        },
      },
    },
  };
}

async function productionAssets() {
  const manifest = JSON.parse(
    await readFile(resolve(stage, 'dist/preview/.vite/manifest.json'), 'utf8'),
  );
  const entry = manifest['index.html'];
  if (entry?.isEntry !== true) throw new Error('Packaged Vite manifest has no index entry');
  const paths = ['index.html', entry.file, ...(entry.css ?? []), ...(entry.assets ?? [])];
  return new Map(
    await Promise.all(
      paths.map(async (path) => [
        path === 'index.html' ? '/' : `/${path}`,
        {
          body: await readFile(resolve(stage, 'dist/preview', path)),
          type: mimeTypes.get(extname(path)) ?? 'application/octet-stream',
        },
      ]),
    ),
  );
}

async function fixtureServer(snapshot, assets) {
  const clients = new Set();
  const server = createServer((request, response) => {
    if (request.url === '/api/preview') {
      const body = Buffer.from(JSON.stringify(snapshot));
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Length': body.length,
        'Content-Type': 'application/json',
      });
      response.end(body);
      return;
    }
    if (request.url === '/api/events') {
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Connection': 'keep-alive',
        'Content-Type': 'text/event-stream',
      });
      response.write(
        `event: refresh\ndata: ${JSON.stringify({ generation: 1, schemaVersion: 1, stateKind: 'current', type: 'refresh' })}\n\n`,
      );
      clients.add(response);
      request.once('close', () => clients.delete(response));
      return;
    }
    const asset = assets.get(request.url);
    if (asset === undefined) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Length': asset.body.length,
      'Content-Type': asset.type,
    });
    response.end(asset.body);
  });
  await new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', accept);
  });
  const address = server.address();
  return {
    close: async () => {
      for (const client of clients) client.end();
      await new Promise((accept) => server.close(accept));
    },
    url: `http://127.0.0.1:${address.port}`,
  };
}

async function processTreeRssBytes(rootPid) {
  const processEntries = await import('node:fs/promises').then(({ readdir }) => readdir('/proc'));
  const parentByPid = new Map();
  for (const entry of processEntries) {
    if (!/^\d+$/u.test(entry)) continue;
    try {
      const stat = await readFile(`/proc/${entry}/stat`, 'utf8');
      const afterName = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
      parentByPid.set(Number(entry), Number(afterName[1]));
    } catch {}
  }
  const descendants = new Set([rootPid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [pid, parent] of parentByPid) {
      if (descendants.has(parent) && !descendants.has(pid)) {
        descendants.add(pid);
        changed = true;
      }
    }
  }
  let pages = 0;
  for (const pid of descendants) {
    try {
      const statm = (await readFile(`/proc/${pid}/statm`, 'utf8')).trim().split(/\s+/u);
      pages += Number(statm[1]);
    } catch {}
  }
  return pages * 4096;
}

async function qualifySize(nodeCount, assets) {
  const snapshot = seededSnapshot(nodeCount);
  const server = await fixtureServer(snapshot, assets);
  const browserServer = await chromium.launchServer({ headless: true });
  const browserPid = browserServer.process().pid;
  const browser = await chromium.connect(browserServer.wsEndpoint());
  const context = await browser.newContext({ viewport: { height: 900, width: 1440 } });
  await context.addInitScript(() => {
    globalThis.__questspecLongTasks = [];
    new PerformanceObserver((entries) => {
      for (const entry of entries.getEntries())
        globalThis.__questspecLongTasks.push(entry.duration);
    }).observe({ buffered: true, type: 'longtask' });
  });
  const page = await context.newPage();
  const baselineBytes = await processTreeRssBytes(browserPid);
  let peakBytes = baselineBytes;
  const sampler = setInterval(() => {
    void processTreeRssBytes(browserPid).then((bytes) => {
      peakBytes = Math.max(peakBytes, bytes);
    });
  }, 25);
  try {
    const readinessStarted = performance.now();
    await page.goto(server.url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      (expected) =>
        document.querySelectorAll('[data-instance-id]').length === expected &&
        document.body.textContent.includes('Current and valid'),
      nodeCount,
      { timeout: 30_000 },
    );
    const readinessMilliseconds = performance.now() - readinessStarted;
    await page.evaluate(() => {
      globalThis.__questspecLongTasks.length = 0;
    });

    const canvas = page.getByRole('listbox');
    const box = await canvas.boundingBox();
    if (box === null) throw new Error('Quest canvas has no browser bounding box');
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.45, { steps: 4 });
    await page.mouse.up();
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await page.getByRole('button', { name: 'Zoom out' }).click();
    const query = `scale.q${String(nodeCount - 1).padStart(4, '0')}`;
    await page.getByLabel('Find a quest').fill(query);
    const result = page.getByRole('button', { name: new RegExp(query) });
    await result.waitFor();
    await result.click();
    await page.getByRole('heading', { name: query }).waitFor();
    await page.waitForTimeout(100);

    const browserMetrics = await page.evaluate(() => ({
      domNodes: document.querySelectorAll('*').length,
      interactionLongTasksMilliseconds: globalThis.__questspecLongTasks,
    }));
    peakBytes = Math.max(peakBytes, await processTreeRssBytes(browserPid));
    const maximumLongTaskMilliseconds = Math.max(
      0,
      ...browserMetrics.interactionLongTasksMilliseconds,
    );
    const mib = 1024 * 1024;
    return {
      browserProcessRssBaselineMiB: baselineBytes / mib,
      browserProcessRssDeltaMiB: Math.max(0, peakBytes - baselineBytes) / mib,
      browserProcessRssPeakMiB: peakBytes / mib,
      domNodes: browserMetrics.domNodes,
      edgeCount: nodeCount * 2,
      interactionLongTasksMilliseconds: browserMetrics.interactionLongTasksMilliseconds,
      maximumInteractionLongTaskMilliseconds: maximumLongTaskMilliseconds,
      nodeCount,
      readinessMilliseconds,
      viewport: { height: 900, width: 1440 },
    };
  } finally {
    clearInterval(sampler);
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
    await browserServer.close().catch(() => undefined);
    await server.close();
  }
}

const assets = await productionAssets();
const measurements = [];
let failure;
try {
  for (const size of sizes) measurements.push(await qualifySize(size, assets));
  const gate = measurements[0];
  const failures = [
    gate.readinessMilliseconds > 3000 &&
      `readiness ${gate.readinessMilliseconds.toFixed(1)}ms > 3000ms`,
    gate.maximumInteractionLongTaskMilliseconds > 100 &&
      `interaction long task ${gate.maximumInteractionLongTaskMilliseconds.toFixed(1)}ms > 100ms`,
    gate.domNodes > 25_000 && `DOM ${gate.domNodes} > 25000`,
    gate.browserProcessRssDeltaMiB > 250 &&
      `browser RSS delta ${gate.browserProcessRssDeltaMiB.toFixed(1)}MiB > 250MiB`,
  ].filter(Boolean);
  if (failures.length > 0) failure = failures.join('; ');
} catch (error) {
  failure = error instanceof Error ? error.message : String(error);
}

const report = {
  acceptance: {
    browserProcessRssDeltaMiB: 250,
    domNodes: 25_000,
    enforcedNodeCount: 500,
    maximumInteractionLongTaskMilliseconds: 100,
    readinessMilliseconds: 3000,
  },
  degradationPolicy: {
    500: 'enforced: every acceptance budget must pass',
    1000: 'observational: execution must complete and metrics are recorded; no numeric budget yet',
    2000: 'observational: execution must complete and metrics are recorded; no numeric budget yet',
  },
  failure: failure ?? null,
  fixture: { edgeRatio: 2, seed },
  measurements,
  passed: failure === undefined,
  runtime: {
    chromium: chromium.executablePath(),
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
  },
  schemaVersion: 1,
};
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (failure !== undefined) throw new Error(`Preview performance qualification failed: ${failure}`);
console.log(`Preview performance qualification passed; report: ${reportPath}`);

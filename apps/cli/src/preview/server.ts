import { readFile, realpath, stat } from 'node:fs/promises';
import { type Server, createServer } from 'node:http';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSnbtDirectory } from '@questspec/core/filesystem/read-directory';
import { type QuestPreview, buildQuestPreview } from '@questspec/core/preview/model';
import { renderPreviewPage } from './page.ts';

export interface PreviewServerOptions {
  locale?: string;
  port?: number;
}

export interface PreviewServer {
  close(): Promise<void>;
  preview: QuestPreview;
  server: Server;
  url: string;
}

interface PreviewAsset {
  body: Buffer;
  contentType: string;
}

export async function startPreviewServer(
  directory: string,
  options: PreviewServerOptions = {},
): Promise<PreviewServer> {
  const input = resolve(directory);
  const root = await realpath(input);
  if (!(await stat(root)).isDirectory()) {
    throw new Error(`questspec serve: not a directory: ${input}`);
  }
  const files = await readSnbtDirectory(root);
  const preview = buildQuestPreview(root, files, options.locale);
  if (preview.stats.chapters === 0) {
    throw new Error(`questspec serve: no readable FTB Quests chapters found in ${root}`);
  }
  const [javascript, stylesheet, themeBootstrap] = await Promise.all([
    loadPreviewAsset('app.js', 'text/javascript; charset=utf-8'),
    loadPreviewAsset('app.css', 'text/css; charset=utf-8'),
    loadPreviewAsset('theme.js', 'text/javascript; charset=utf-8'),
  ]);
  const page = renderPreviewPage(preview);
  const previewJson = Buffer.from(JSON.stringify(preview));
  const assets = new Map<string, PreviewAsset>([
    ['/assets/app.css', stylesheet],
    ['/assets/app.js', javascript],
    ['/assets/theme.js', themeBootstrap],
  ]);
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src data:; base-uri 'none'; frame-ancestors 'none'",
    );
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    if (path === '/' || path === '/index.html') {
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/html; charset=utf-8',
      });
      response.end(request.method === 'HEAD' ? undefined : page);
      return;
    }
    if (path === '/preview.json') {
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json; charset=utf-8',
      });
      response.end(request.method === 'HEAD' ? undefined : previewJson);
      return;
    }
    const asset = assets.get(path);
    if (asset !== undefined) {
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type': asset.contentType,
      });
      response.end(request.method === 'HEAD' ? undefined : asset.body);
      return;
    }
    if (path === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(request.method === 'HEAD' ? undefined : JSON.stringify({ status: 'ok' }));
      return;
    }
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
  });

  await new Promise<void>((accept, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, '127.0.0.1', () => {
      server.off('error', reject);
      accept();
    });
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    await closeServer(server);
    throw new Error('questspec serve: failed to determine preview server address');
  }
  return {
    close: () => closeServer(server),
    preview,
    server,
    url: `http://127.0.0.1:${address.port}/`,
  };
}

async function loadPreviewAsset(filename: string, contentType: string): Promise<PreviewAsset> {
  const directory = previewAssetDirectory();
  try {
    return { body: await readFile(join(directory, filename)), contentType };
  } catch (error) {
    throw new Error(
      `questspec serve: browser asset ${filename} is missing; run the QuestSpec build before serving`,
      { cause: error },
    );
  }
}

function previewAssetDirectory(): string {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  const runningFromSource = basename(dirname(moduleDirectory)) === 'src';
  return runningFromSource
    ? resolve(moduleDirectory, '../../../preview/dist')
    : join(moduleDirectory, 'preview');
}

function closeServer(server: Server): Promise<void> {
  return new Promise((accept, reject) => {
    server.close((error) => (error === undefined ? accept() : reject(error)));
  });
}

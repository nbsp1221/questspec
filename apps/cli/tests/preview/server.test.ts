import { type AddressInfo, Socket, createServer as createNetServer } from 'node:net';
import {
  PREVIEW_SCHEMA_VERSION,
  type PreviewEventV1,
  type PreviewSnapshotV1,
} from '@questspec/preview-contract';
import { afterEach, describe, expect, it } from 'vitest';
import {
  type PreviewServer,
  PreviewServerAddressInUseError,
  PreviewServerStartupError,
  type PreviewSessionLike,
  startPreviewServer,
} from '../../src/preview/server.ts';
import {
  StaticAssetManifestError,
  createStaticAssetProvider,
} from '../../src/preview/static-assets.ts';

const html =
  '<!doctype html><html><body><div id="root"></div><script type="module" src="/assets/app.js"></script></body></html>';

const assets = () =>
  createStaticAssetProvider([
    { body: html, mediaType: 'text/html; charset=utf-8', path: '/' },
    {
      body: 'import "/assets/app.css"; console.log("preview")',
      mediaType: 'application/javascript; charset=utf-8',
      path: '/assets/app.js',
    },
    { body: 'body{color:#123}', mediaType: 'text/css; charset=utf-8', path: '/assets/app.css' },
    {
      body: Uint8Array.of(0, 97, 115, 109),
      mediaType: 'application/wasm',
      path: '/assets/view.wasm',
    },
  ]);

function snapshot(overrides: Partial<PreviewSnapshotV1> = {}): PreviewSnapshotV1 {
  return {
    currentInput: {
      catalogState: 'not-requested',
      sourceState: 'not-normalizable',
      validationState: 'invalid',
    },
    diagnostics: [],
    generation: 0,
    model: null,
    modelNotices: [],
    provenanceByInstanceId: {},
    retainedModel: null,
    schemaVersion: PREVIEW_SCHEMA_VERSION,
    sessionNotices: [],
    ...overrides,
  };
}

class FakeSession implements PreviewSessionLike {
  closeCalls = 0;
  readonly subscribers = new Set<(event: PreviewEventV1) => void>();
  value: PreviewSnapshotV1;

  constructor(value = snapshot()) {
    this.value = value;
  }

  close(): void {
    this.closeCalls += 1;
  }

  getSnapshot(): PreviewSnapshotV1 {
    return this.value;
  }

  publish(event: PreviewEventV1): void {
    for (const subscriber of this.subscribers) {
      subscriber(event);
    }
  }

  subscribe(subscriber: (event: PreviewEventV1) => void): () => void {
    this.subscribers.add(subscriber);
    return () => this.subscribers.delete(subscriber);
  }
}

const openServers = new Set<PreviewServer>();

afterEach(async () => {
  await Promise.all([...openServers].map((server) => server.close()));
  openServers.clear();
});

async function start(
  session: FakeSession = new FakeSession(),
  options: {
    heartbeatMs?: number;
    maxSseClients?: number;
    ownSession?: boolean;
    port?: number;
  } = {},
): Promise<PreviewServer> {
  const server = await startPreviewServer({
    assets: assets(),
    heartbeatMs: options.heartbeatMs,
    maxSseClients: options.maxSseClients,
    ownSession: options.ownSession,
    port: options.port ?? 0,
    session,
  });
  openServers.add(server);
  return server;
}

async function body(response: Response): Promise<string> {
  const value = await response.text();
  expect(response.bodyUsed).toBe(true);
  return value;
}

async function rawRequest(port: number, request: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const connection = new Socket();
    connection.setTimeout(2_000);
    connection.connect(port, '127.0.0.1', () => connection.end(request));
    connection.on('data', (chunk: Buffer) => chunks.push(chunk));
    connection.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    connection.on('error', reject);
    connection.on('timeout', () => connection.destroy(new Error('Raw request timed out')));
  });
}

async function readUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  predicate: (value: string) => boolean,
): Promise<string> {
  const decoder = new TextDecoder();
  let value = '';
  const timeout = AbortSignal.timeout(2_000);
  while (!predicate(value)) {
    const next = await Promise.race([
      reader.read(),
      new Promise<never>((_resolve, reject) => {
        timeout.addEventListener('abort', () => reject(new Error('Stream assertion timed out')), {
          once: true,
        });
      }),
    ]);
    if (next.done) {
      throw new Error('Stream ended before expected content');
    }
    value += decoder.decode(next.value, { stream: true });
  }
  return value;
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) {
      return;
    }
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }
  expect(predicate()).toBe(true);
}

describe('static asset manifest', () => {
  it('copies declarations and responses so callers cannot mutate served bytes', () => {
    const source = new TextEncoder().encode(html);
    const provider = createStaticAssetProvider([
      { body: source, mediaType: 'text/html; charset=utf-8', path: '/' },
    ]);
    source.fill(120);
    const first = provider.get('/')!;
    first.body.fill(121);

    expect(new TextDecoder().decode(provider.get('/')!.body)).toBe(html);
    expect(Object.isFrozen(provider)).toBe(true);
    expect(Object.isFrozen(provider.paths)).toBe(true);
  });

  it.each([
    [[{ body: html, mediaType: 'text/html; charset=utf-8', path: '/index.html' }], 'root'],
    [
      [
        { body: html, mediaType: 'text/html; charset=utf-8', path: '/' },
        { body: 'map', mediaType: 'application/json; charset=utf-8', path: '/assets/app.js.map' },
      ],
      'Source maps',
    ],
    [
      [
        { body: html, mediaType: 'text/html; charset=utf-8', path: '/' },
        { body: 'x', mediaType: 'text/plain; charset=utf-8', path: '/assets/x.txt' },
      ],
      'media type',
    ],
    [
      [
        { body: html, mediaType: 'text/html; charset=utf-8', path: '/' },
        {
          body: '//# sourceURL=file:///home/alice/src.ts',
          mediaType: 'application/javascript; charset=utf-8',
          path: '/assets/x.js',
        },
      ],
      'build information',
    ],
  ])('rejects invalid manifests distinctly %#', (declarations, message) => {
    expect(() => createStaticAssetProvider(declarations)).toThrowError(StaticAssetManifestError);
    expect(() => createStaticAssetProvider(declarations)).toThrow(message);
  });
});

describe('preview HTTP server routing and headers', () => {
  it('binds an ephemeral literal IPv4 loopback URL and serves only declared surfaces', async () => {
    const session = new FakeSession(snapshot({ generation: 7 }));
    const server = await start(session);

    expect(server).toMatchObject({ host: '127.0.0.1', url: `http://127.0.0.1:${server.port}` });
    expect(server.port).toBeGreaterThan(0);

    const root = await fetch(`${server.url}/`);
    expect(await body(root)).toBe(html);
    expect(root.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(root.headers.get('content-security-policy')).toContain("script-src 'self'");
    expect(root.headers.get('content-security-policy')).not.toContain("'unsafe-inline'");
    expect(root.headers.get('x-content-type-options')).toBe('nosniff');
    expect(root.headers.get('access-control-allow-origin')).toBeNull();

    const script = await fetch(`${server.url}/assets/app.js`);
    expect(script.headers.get('content-type')).toBe('application/javascript; charset=utf-8');
    expect(await body(script)).toContain('preview');

    const api = await fetch(`${server.url}/api/preview`);
    expect(api.headers.get('cache-control')).toBe('no-store');
    expect(await api.json()).toMatchObject({
      generation: 7,
      schemaVersion: PREVIEW_SCHEMA_VERSION,
    });
    const health = await fetch(`${server.url}/health`);
    expect(await health.json()).toEqual({ status: 'ok' });
  });

  it('implements HEAD without bodies and rejects unsupported methods safely', async () => {
    const server = await start();
    for (const path of ['/', '/assets/app.js', '/api/preview', '/health']) {
      const get = await fetch(`${server.url}${path}`);
      const expectedLength = Number(get.headers.get('content-length'));
      await get.arrayBuffer();
      const head = await fetch(`${server.url}${path}`, { method: 'HEAD' });
      expect(head.status).toBe(200);
      expect(Number(head.headers.get('content-length'))).toBe(expectedLength);
      expect(await head.text()).toBe('');
    }
    for (const path of ['/', '/api/preview', '/api/events', '/health']) {
      const response = await fetch(`${server.url}${path}`, { method: 'POST' });
      expect(response.status).toBe(405);
      expect(await body(response)).toBe('Method Not Allowed');
    }
    const connect = await rawRequest(
      server.port,
      `CONNECT 127.0.0.1:${server.port} HTTP/1.1\r\nHost: 127.0.0.1:${server.port}\r\nConnection: close\r\n\r\n`,
    );
    expect(connect).toContain('405 Method Not Allowed');
  });

  it.each([
    '/missing',
    '/assets/app.js.map',
    '/assets/../app.js',
    '/assets/%2e%2e/app.js',
    '/assets/%252e%252e/app.js',
    '/assets/app.js?x=1',
    '/api/preview?x=1',
    '/health?x=1',
    '/%00',
  ])('does not normalize or expose undeclared request target %s', async (path) => {
    const server = await start();
    const response = await fetch(`${server.url}${path}`, { redirect: 'manual' });
    expect(response.status).toBe(404);
    expect(await body(response)).toBe('Not Found');
  });

  it('rejects raw backslash and NUL request targets before routing', async () => {
    const server = await start();
    for (const target of [
      '/assets\\app.js',
      '/assets/\0app.js',
      `${server.url}/assets/../assets/app.js`,
    ]) {
      const result = await rawRequest(
        server.port,
        `GET ${target} HTTP/1.1\r\nHost: 127.0.0.1:${server.port}\r\nConnection: close\r\n\r\n`,
      );
      expect(result).toMatch(/400 Bad Request|404 Not Found/);
      expect(result).not.toContain('console.log');
    }
  });
});

describe('authority and origin validation', () => {
  it('accepts only one exact raw Host header and ignores forwarding headers', async () => {
    const server = await start();
    const valid = await rawRequest(
      server.port,
      `GET /health HTTP/1.1\r\nHost: 127.0.0.1:${server.port}\r\nX-Forwarded-Host: evil.example\r\nConnection: close\r\n\r\n`,
    );
    expect(valid).toContain('200 OK');
    for (const hostLines of [
      '',
      'Host: localhost',
      `Host: 127.0.0.1:${server.port}\r\nHost: 127.0.0.1:${server.port}`,
      `Host: 127.0.0.1:${server.port}, evil.example`,
      `Host: [::1]:${server.port}`,
    ]) {
      const result = await rawRequest(
        server.port,
        `GET /health HTTP/1.1\r\n${hostLines}\r\nConnection: close\r\n\r\n`,
      );
      expect(result).toMatch(/400 Bad Request/);
      expect(result).not.toContain('evil.example');
    }
  });

  it('checks absolute-form authority against Host and rejects malformed targets', async () => {
    const server = await start();
    const accepted = await rawRequest(
      server.port,
      `GET http://127.0.0.1:${server.port}/health HTTP/1.1\r\nHost: 127.0.0.1:${server.port}\r\nConnection: close\r\n\r\n`,
    );
    expect(accepted).toContain('200 OK');
    for (const target of [
      `http://localhost:${server.port}/health`,
      `http://127.0.0.1:${server.port + 1}/health`,
      `https://127.0.0.1:${server.port}/health`,
      `http://user@127.0.0.1:${server.port}/health`,
    ]) {
      const rejected = await rawRequest(
        server.port,
        `GET ${target} HTTP/1.1\r\nHost: 127.0.0.1:${server.port}\r\nConnection: close\r\n\r\n`,
      );
      expect(rejected).toContain('400 Bad Request');
    }
  });

  it('accepts absent or exact same origin and rejects null, cross-origin, and duplicate origins consistently', async () => {
    const server = await start();
    for (const path of ['/', '/api/preview', '/api/events', '/health']) {
      const same = await fetch(`${server.url}${path}`, {
        headers: { Origin: server.url },
        signal: path === '/api/events' ? AbortSignal.timeout(100) : undefined,
      }).catch((error: unknown) => {
        if (path !== '/api/events') {
          throw error;
        }
        return undefined;
      });
      if (same !== undefined) {
        expect(same.status).toBe(200);
        if (path === '/api/events') {
          await same.body?.cancel();
        } else {
          await same.arrayBuffer();
        }
      }
      for (const origin of ['null', 'http://localhost', 'https://127.0.0.1']) {
        const rejected = await fetch(`${server.url}${path}`, { headers: { Origin: origin } });
        expect(rejected.status).toBe(403);
        await rejected.arrayBuffer();
      }
    }
    const duplicate = await rawRequest(
      server.port,
      `GET /api/preview HTTP/1.1\r\nHost: 127.0.0.1:${server.port}\r\nOrigin: ${server.url}\r\nOrigin: ${server.url}\r\nConnection: close\r\n\r\n`,
    );
    expect(duplicate).toContain('403 Forbidden');
  });
});

describe('SSE lifecycle', () => {
  it('sends bounded initial and refresh notifications, heartbeats, and no full snapshot', async () => {
    const secret = '/home/alice/private/quests.yml';
    const session = new FakeSession(
      snapshot({
        generation: 4,
        sessionNotices: [{ code: 'X', message: secret, path: [], severity: 'warning' }],
      }),
    );
    const server = await start(session, { heartbeatMs: 100 });
    const response = await fetch(`${server.url}/api/events`);
    expect(response.headers.get('content-type')).toBe('text/event-stream; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe('no-store');
    const reader = response.body!.getReader();
    const initial = await readUntil(reader, (value) => value.includes('\n\n'));
    expect(initial).toContain('"generation":4');
    expect(initial).not.toContain(secret);
    expect(initial).not.toContain('sessionNotices');

    session.publish({
      generation: 5,
      schemaVersion: PREVIEW_SCHEMA_VERSION,
      stateKind: 'current',
      type: 'refresh',
    });
    const refreshAndHeartbeat = await readUntil(
      reader,
      (value) => value.includes('"generation":5') && value.includes(': heartbeat'),
    );
    expect(refreshAndHeartbeat).toContain('event: refresh');
    await reader.cancel();
    await waitFor(() => session.subscribers.size === 0);
  });

  it('enforces the client limit and cleans up aborted reconnects', async () => {
    const session = new FakeSession();
    const server = await start(session, { maxSseClients: 1 });
    const first = await fetch(`${server.url}/api/events`);
    expect(first.status).toBe(200);
    await waitFor(() => session.subscribers.size === 1);
    const second = await fetch(`${server.url}/api/events`);
    expect(second.status).toBe(503);
    await second.arrayBuffer();
    await first.body!.cancel();
    await waitFor(() => session.subscribers.size === 0);
    const reconnected = await fetch(`${server.url}/api/events`);
    expect(reconnected.status).toBe(200);
    await reconnected.body!.cancel();
    await waitFor(() => session.subscribers.size === 0);
  });
});

describe('leak resistance, limits, startup, and shutdown', () => {
  it('recursively redacts path and stack-like payloads from every response surface', async () => {
    const seeds = [
      '/home/alice/project/quests.yml',
      'C:\\Users\\Alice\\project\\quests.yml',
      '\\\\server\\share\\quests.yml',
      'file:///tmp/private/quests.yml',
      '    at evaluate (/workspace/src/preview.ts:7:2)',
    ];
    const nested = { deep: { values: seeds } };
    const session = new FakeSession(
      snapshot({
        diagnostics: [
          {
            code: 'SECRET',
            message: seeds.join(' | '),
            path: ['nested', JSON.stringify(nested)],
            severity: 'error',
          },
        ],
      }),
    );
    const server = await start(session);
    const responses = await Promise.all(
      ['/', '/assets/app.js', '/assets/app.css', '/api/preview', '/health', '/missing'].map(
        async (path) => {
          const response = await fetch(`${server.url}${path}`);
          return body(response);
        },
      ),
    );
    const sse = await fetch(`${server.url}/api/events`);
    const reader = sse.body!.getReader();
    responses.push(await readUntil(reader, (value) => value.includes('\n\n')));
    session.publish({
      generation: 1,
      nested,
      schemaVersion: PREVIEW_SCHEMA_VERSION,
      stateKind: 'empty',
      type: 'refresh',
    } as PreviewEventV1);
    responses.push(await readUntil(reader, (value) => value.includes('"generation":1')));
    await reader.cancel();
    const combined = responses.join('\n');
    for (const seed of seeds) {
      expect(combined).not.toContain(seed);
    }
    expect(combined).not.toContain('preview.ts:7:2');
  });

  it('returns bounded generic errors for oversized serialization, URLs, and headers', async () => {
    const session = new FakeSession(
      snapshot({
        diagnostics: Array.from({ length: 100_001 }, () => ({
          code: 'X',
          message: 'bounded',
          path: [],
          severity: 'error' as const,
        })),
      }),
    );
    const server = await start(session);
    const oversized = await fetch(`${server.url}/api/preview`);
    expect(oversized.status).toBe(500);
    expect(await body(oversized)).toBe('Internal Server Error');
    const longUrl = await rawRequest(
      server.port,
      `GET /${'x'.repeat(3_000)} HTTP/1.1\r\nHost: 127.0.0.1:${server.port}\r\nConnection: close\r\n\r\n`,
    );
    expect(longUrl).toContain('414');
    expect(longUrl.length).toBeLessThan(1_000);
    const hugeHeader = await rawRequest(
      server.port,
      `GET /health HTTP/1.1\r\nHost: 127.0.0.1:${server.port}\r\nX-Large: ${'z'.repeat(20_000)}\r\nConnection: close\r\n\r\n`,
    );
    expect(hugeHeader).toMatch(/400 Bad Request|431 Request Header Fields Too Large/);
    expect(hugeHeader).not.toContain('z'.repeat(100));
  });

  it('distinguishes invalid options and address-in-use startup failures', async () => {
    await expect(
      startPreviewServer({ assets: assets(), port: 65_536, session: new FakeSession() }),
    ).rejects.toBeInstanceOf(PreviewServerStartupError);
    const occupied = createNetServer();
    await new Promise<void>((resolve) => {
      occupied.listen(0, '127.0.0.1', resolve);
    });
    const port = (occupied.address() as AddressInfo).port;
    await expect(
      startPreviewServer({ assets: assets(), port, session: new FakeSession() }),
    ).rejects.toBeInstanceOf(PreviewServerAddressInUseError);
    await new Promise<void>((resolve, reject) => {
      occupied.close((error) => {
        if (error === undefined) {
          resolve();
        } else {
          reject(error);
        }
      });
    });
  });

  it('closes idempotently, drains SSE clients, and closes only owned sessions', async () => {
    const borrowed = new FakeSession();
    const borrowedServer = await start(borrowed);
    const stream = await fetch(`${borrowedServer.url}/api/events`);
    await waitFor(() => borrowed.subscribers.size === 1);
    await Promise.all([borrowedServer.close(), borrowedServer.close()]);
    openServers.delete(borrowedServer);
    expect(borrowed.closeCalls).toBe(0);
    expect(borrowed.subscribers.size).toBe(0);
    await stream.body?.cancel().catch(() => undefined);

    const owned = new FakeSession();
    const ownedServer = await start(owned, { ownSession: true });
    await Promise.all([ownedServer.close(), ownedServer.close()]);
    openServers.delete(ownedServer);
    expect(owned.closeCalls).toBe(1);
  });
});

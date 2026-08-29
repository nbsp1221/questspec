import { realpath, stat } from 'node:fs/promises';
import { type Server, createServer } from 'node:http';
import { resolve } from 'node:path';
import { readSnbtDirectory } from '../filesystem/read-directory.ts';
import { type QuestPreview, buildQuestPreview } from './model.ts';
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
  const page = renderPreviewPage(preview);
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; frame-ancestors 'none'",
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

function closeServer(server: Server): Promise<void> {
  return new Promise((accept, reject) => {
    server.close((error) => (error === undefined ? accept() : reject(error)));
  });
}

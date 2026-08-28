import type { Socket } from 'node:net';
import type { Duplex } from 'node:stream';
import { type IncomingMessage, type Server, type ServerResponse, createServer } from 'node:http';
import type {
  PreviewEventV1,
  PreviewSnapshotStateKind,
  PreviewSnapshotV1,
} from '@questspec/preview-contract';
import type { StaticAssetProvider } from './static-assets.ts';

const HOST = '127.0.0.1';
const MAX_JSON_BYTES = 2 * 1024 * 1024;
const MAX_SERIALIZATION_NODES = 100_000;
const MAX_STRING_LENGTH = 128 * 1024;
const MAX_URL_LENGTH = 2_048;
const MAX_SSE_EVENT_BYTES = 16 * 1024;
const MAX_SSE_BUFFER_BYTES = 64 * 1024;
const DEFAULT_HEARTBEAT_MS = 15_000;
const DEFAULT_MAX_SSE_CLIENTS = 32;
const CLOSE_GRACE_MS = 1_000;

const CSP = [
  "default-src 'none'",
  "base-uri 'none'",
  "connect-src 'self'",
  "font-src 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "img-src 'self' data:",
  "manifest-src 'self'",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
].join('; ');

const LOCAL_PATH_PATTERNS = [
  /file:\/\/[^\s"'<>]+/giu,
  /\\\\[^\\\s]+\\[^\s"'<>]*/gu,
  /\b[A-Za-z]:[\\/][^\s"'<>]*/gu,
  /\/(?:home|Users|private|tmp|var\/folders|workspace|workspaces|runner|builds)\/[^\s"'<>]*/gu,
  /(?:^|\n)\s*at\s+(?:async\s+)?[\w.$<>]+\s+\([^\n)]*:\d+:\d+\)/gu,
];

export interface PreviewSessionLike {
  close(): void;
  getSnapshot(): PreviewSnapshotV1;
  subscribe(subscriber: (event: PreviewEventV1) => void): () => void;
}

export interface PreviewServerHooks {
  readonly afterListen?: (server: Server) => void;
}

export interface StartPreviewServerOptions {
  readonly assets: StaticAssetProvider;
  readonly heartbeatMs?: number;
  readonly hooks?: PreviewServerHooks;
  readonly maxSseClients?: number;
  readonly ownSession?: boolean;
  readonly port: number;
  readonly session: PreviewSessionLike;
}

export interface PreviewServer {
  readonly failure: Promise<void>;
  readonly host: typeof HOST;
  readonly port: number;
  readonly url: string;
  close(): Promise<void>;
}

export class PreviewServerAddressInUseError extends Error {
  override readonly name = 'PreviewServerAddressInUseError';

  constructor(port: number) {
    super(`Preview server port ${port} is already in use`);
  }
}

export class PreviewServerRuntimeError extends Error {
  override readonly name = 'PreviewServerRuntimeError';

  constructor(options: ErrorOptions = {}) {
    super('Preview server failed after startup', options);
  }
}

export class PreviewServerStartupError extends Error {
  override readonly name = 'PreviewServerStartupError';

  constructor(message: string) {
    super(message);
  }
}

interface SseClient {
  readonly response: ServerResponse;
  readonly unsubscribe: () => void;
  close(): void;
  send(event: PreviewEventV1): void;
}

export async function startPreviewServer(
  options: StartPreviewServerOptions,
): Promise<PreviewServer> {
  validateOptions(options);
  const sockets = new Set<Socket>();
  const clients = new Set<SseClient>();
  let actualPort = 0;
  let closing = false;
  let listening = false;
  let failureSettled = false;
  let resolveFailure!: () => void;
  let rejectFailure!: (error: PreviewServerRuntimeError) => void;
  const failure = new Promise<void>((resolve, reject) => {
    resolveFailure = resolve;
    rejectFailure = reject;
  });
  void failure.catch(() => undefined);
  const server = createServer(
    {
      highWaterMark: 16 * 1024,
      keepAlive: true,
      keepAliveTimeout: 5_000,
      maxHeaderSize: 16 * 1024,
      noDelay: true,
      requestTimeout: 10_000,
    },
    (request, response) => {
      try {
        handleRequest(request, response, options, actualPort, clients);
      } catch {
        sendError(response, 500, 'Internal Server Error');
      }
    },
  );
  configureServer(server);

  const onRuntimeError = (error: Error): void => {
    if (!listening || closing || failureSettled) {
      return;
    }
    failureSettled = true;
    rejectFailure(new PreviewServerRuntimeError({ cause: error }));
  };

  server.on('error', onRuntimeError);
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.setTimeout(30_000);
    socket.once('close', () => sockets.delete(socket));
  });
  server.on('clientError', (_error, socket) => {
    if (socket.writable) {
      socket.end(
        'HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 11\r\nContent-Type: text/plain; charset=utf-8\r\nX-Content-Type-Options: nosniff\r\n\r\nBad Request',
      );
    }
  });

  await listen(server, options.port);
  const address = server.address();
  server.on('connect', (request, socket) => {
    rejectSpecialRequest(request, socket, actualPort);
  });
  server.on('upgrade', (request, socket) => {
    rejectSpecialRequest(request, socket, actualPort);
  });
  if (address === null || typeof address === 'string' || address.address !== HOST) {
    server.close();
    throw new PreviewServerStartupError(
      'Preview server did not bind to the required loopback address',
    );
  }
  actualPort = address.port;
  listening = true;
  options.hooks?.afterListen?.(server);

  const close = async (): Promise<void> => {
    if (closing) {
      return closePromise;
    }
    closing = true;
    listening = false;
    server.off('error', onRuntimeError);

    const ignoreCloseError = (): void => undefined;

    server.on('error', ignoreCloseError);
    for (const client of clients) {
      client.close();
    }
    const timer = setTimeout(() => {
      for (const socket of sockets) {
        socket.destroy();
      }
    }, CLOSE_GRACE_MS);
    timer.unref();
    try {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    } finally {
      clearTimeout(timer);
      server.off('error', ignoreCloseError);
      if (!failureSettled) {
        failureSettled = true;
        resolveFailure();
      }
      if (options.ownSession === true) {
        options.session.close();
      }
    }
  };

  let closePromise: Promise<void> = Promise.resolve();

  const closeOnce = (): Promise<void> => {
    if (!closing) {
      closePromise = close();
    }
    return closePromise;
  };

  return Object.freeze({
    close: closeOnce,
    failure,
    host: HOST,
    port: actualPort,
    url: `http://${HOST}:${actualPort}`,
  });
}

function configureServer(server: Server): void {
  server.headersTimeout = 5_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 32;
  server.requestTimeout = 10_000;
  server.timeout = 30_000;
}

function validateOptions(options: StartPreviewServerOptions): void {
  if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65_535) {
    throw new PreviewServerStartupError(
      'Preview server port must be an integer from 0 through 65535',
    );
  }
  if (
    options.heartbeatMs !== undefined &&
    (!Number.isInteger(options.heartbeatMs) ||
      options.heartbeatMs < 100 ||
      options.heartbeatMs > 60_000)
  ) {
    throw new PreviewServerStartupError('Preview server heartbeat interval is invalid');
  }
  if (
    options.maxSseClients !== undefined &&
    (!Number.isInteger(options.maxSseClients) ||
      options.maxSseClients < 1 ||
      options.maxSseClients > 1_024)
  ) {
    throw new PreviewServerStartupError('Preview server SSE client limit is invalid');
  }
  if (!options.assets.paths.includes('/') || options.assets.get('/') === undefined) {
    throw new PreviewServerStartupError('Preview server static asset manifest has no root asset');
  }
}

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: NodeJS.ErrnoException): void => {
      server.off('listening', onListening);
      reject(
        error.code === 'EADDRINUSE'
          ? new PreviewServerAddressInUseError(port)
          : new PreviewServerStartupError('Preview server could not start'),
      );
    };

    const onListening = (): void => {
      server.off('error', onError);
      resolve();
    };

    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, HOST);
  });
}

function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: StartPreviewServerOptions,
  port: number,
  clients: Set<SseClient>,
): void {
  const authority = `${HOST}:${port}`;
  if (!hasExactHeader(request, 'host', authority)) {
    sendError(response, 400, 'Bad Request');
    return;
  }
  const target = request.url ?? '';
  if (target.length === 0 || target.length > MAX_URL_LENGTH) {
    sendError(response, target.length > MAX_URL_LENGTH ? 414 : 400, 'Bad Request');
    return;
  }
  const path = requestPath(target, authority);
  if (path === undefined) {
    sendError(response, 400, 'Bad Request');
    return;
  }
  if (!hasAllowedOrigin(request, `http://${authority}`)) {
    sendError(response, 403, 'Forbidden');
    return;
  }

  if (path === '/api/events') {
    if (request.method !== 'GET') {
      sendMethodNotAllowed(response, 'GET');
      return;
    }
    openEventStream(request, response, options, clients);
    return;
  }
  if (path === '/api/preview') {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      sendMethodNotAllowed(response, 'GET, HEAD');
      return;
    }
    let snapshot: PreviewSnapshotV1;
    try {
      snapshot = options.session.getSnapshot();
    } catch {
      sendError(response, 500, 'Internal Server Error');
      return;
    }
    sendJson(response, request.method === 'HEAD', snapshot);
    return;
  }
  if (path === '/health') {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      sendMethodNotAllowed(response, 'GET, HEAD');
      return;
    }
    sendJson(response, request.method === 'HEAD', { status: 'ok' });
    return;
  }
  const asset = options.assets.get(path);
  if (asset !== undefined) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      sendMethodNotAllowed(response, 'GET, HEAD');
      return;
    }
    setSecurityHeaders(response);
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Content-Length', asset.body.byteLength);
    response.setHeader('Content-Type', asset.mediaType);
    response.statusCode = 200;
    response.end(request.method === 'HEAD' ? undefined : asset.body);
    return;
  }
  sendError(response, 404, 'Not Found');
}

function rejectSpecialRequest(request: IncomingMessage, socket: Duplex, port: number): void {
  const authority = `${HOST}:${port}`;
  const valid =
    hasExactHeader(request, 'host', authority) && hasAllowedOrigin(request, `http://${authority}`);
  const status = valid ? '405 Method Not Allowed' : '400 Bad Request';
  const message = valid ? 'Method Not Allowed' : 'Bad Request';
  socket.end(
    `HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: ${Buffer.byteLength(message)}\r\nContent-Type: text/plain; charset=utf-8\r\nX-Content-Type-Options: nosniff\r\n\r\n${message}`,
  );
}

function requestPath(target: string, authority: string): string | undefined {
  if (target.startsWith('/')) {
    return target;
  }
  const prefix = `http://${authority}`;
  if (!target.startsWith(prefix)) {
    return undefined;
  }
  const path = target.slice(prefix.length);
  return path.startsWith('/') ? path : undefined;
}

function rawHeaderValues(request: IncomingMessage, name: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    if (request.rawHeaders[index]?.toLowerCase() === name) {
      values.push(request.rawHeaders[index + 1] ?? '');
    }
  }
  return values;
}

function hasExactHeader(request: IncomingMessage, name: string, expected: string): boolean {
  const values = rawHeaderValues(request, name);
  return values.length === 1 && values[0] === expected;
}

function hasAllowedOrigin(request: IncomingMessage, expected: string): boolean {
  const values = rawHeaderValues(request, 'origin');
  return values.length === 0 || (values.length === 1 && values[0] === expected);
}

function openEventStream(
  request: IncomingMessage,
  response: ServerResponse,
  options: StartPreviewServerOptions,
  clients: Set<SseClient>,
): void {
  if (clients.size >= (options.maxSseClients ?? DEFAULT_MAX_SSE_CLIENTS)) {
    sendError(response, 503, 'Service Unavailable');
    return;
  }
  setSecurityHeaders(response);
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Connection', 'keep-alive');
  response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  response.setHeader('X-Accel-Buffering', 'no');
  response.statusCode = 200;
  response.flushHeaders();

  let closed = false;

  let unsubscribe = (): void => undefined;

  let heartbeat: NodeJS.Timeout | undefined;
  let lastGeneration = -1;

  const close = (): void => {
    if (closed) {
      return;
    }
    closed = true;
    if (heartbeat !== undefined) {
      clearInterval(heartbeat);
    }
    unsubscribe();
    clients.delete(client);
    if (!response.writableEnded) {
      response.end();
    }
  };

  const send = (event: PreviewEventV1): void => {
    if (closed || event.generation <= lastGeneration) {
      return;
    }
    lastGeneration = event.generation;
    const payload = serializeBounded(event, MAX_SSE_EVENT_BYTES);
    if (payload === undefined || response.writableLength > MAX_SSE_BUFFER_BYTES) {
      close();
      return;
    }
    const writable = response.write(`event: refresh\ndata: ${payload}\n\n`);
    if (!writable || response.writableLength > MAX_SSE_BUFFER_BYTES) {
      close();
    }
  };

  const client: SseClient = { close, response, send, unsubscribe: () => unsubscribe() };
  clients.add(client);
  try {
    unsubscribe = options.session.subscribe(send);
    const snapshot = options.session.getSnapshot();
    send({
      generation: snapshot.generation,
      schemaVersion: snapshot.schemaVersion,
      stateKind: stateKindOf(snapshot),
      type: 'refresh',
    });
  } catch {
    close();
    return;
  }
  heartbeat = setInterval(() => {
    if (closed || response.writableLength > MAX_SSE_BUFFER_BYTES) {
      close();
      return;
    }
    if (!response.write(': heartbeat\n\n')) {
      close();
    }
  }, options.heartbeatMs ?? DEFAULT_HEARTBEAT_MS);
  heartbeat.unref();
  request.once('aborted', close);
  request.once('close', close);
  response.once('close', close);
  response.once('error', close);
}

function stateKindOf(snapshot: PreviewSnapshotV1): PreviewSnapshotStateKind {
  if (snapshot.model === null) {
    return 'empty';
  }
  return snapshot.retainedModel?.state ?? 'empty';
}

function sendJson(response: ServerResponse, head: boolean, value: unknown): void {
  const json = serializeBounded(value, MAX_JSON_BYTES);
  if (json === undefined) {
    sendError(response, 500, 'Internal Server Error');
    return;
  }
  const body = Buffer.from(json);
  setSecurityHeaders(response);
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Length', body.byteLength);
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.statusCode = 200;
  response.end(head ? undefined : body);
}

function serializeBounded(value: unknown, maximumBytes: number): string | undefined {
  let nodes = 0;
  const ancestors = new Set<object>();

  const project = (child: unknown, depth: number): unknown => {
    nodes += 1;
    if (nodes > MAX_SERIALIZATION_NODES || depth > 64) {
      throw new Error('too large');
    }
    if (typeof child === 'string') {
      return sanitizeString(child);
    }
    if (child === null || typeof child === 'boolean' || typeof child === 'number') {
      return child;
    }
    if (typeof child !== 'object') {
      throw new Error('unsupported value');
    }
    if (ancestors.has(child)) {
      throw new Error('cyclic');
    }
    ancestors.add(child);
    try {
      if (Array.isArray(child)) {
        return child.map((entry) => project(entry, depth + 1));
      }
      const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
      for (const [key, entry] of Object.entries(child)) {
        output[sanitizeString(key)] = project(entry, depth + 1);
      }
      return output;
    } finally {
      ancestors.delete(child);
    }
  };

  try {
    const json = JSON.stringify(project(value, 0));
    if (json === undefined || Buffer.byteLength(json) > maximumBytes) {
      return undefined;
    }
    return json;
  } catch {
    return undefined;
  }
}

function sanitizeString(value: string): string {
  let sanitized = value.slice(0, MAX_STRING_LENGTH);
  for (const pattern of LOCAL_PATH_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[redacted]');
  }
  return sanitized;
}

function setSecurityHeaders(response: ServerResponse): void {
  response.setHeader('Content-Security-Policy', CSP);
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
}

function sendMethodNotAllowed(response: ServerResponse, allow: string): void {
  response.setHeader('Allow', allow);
  sendError(response, 405, 'Method Not Allowed');
}

function sendError(response: ServerResponse, status: number, message: string): void {
  if (response.headersSent) {
    response.destroy();
    return;
  }
  const body = Buffer.from(message);
  setSecurityHeaders(response);
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Connection', 'close');
  response.setHeader('Content-Length', body.byteLength);
  response.setHeader('Content-Type', 'text/plain; charset=utf-8');
  response.statusCode = status;
  response.end(body);
}

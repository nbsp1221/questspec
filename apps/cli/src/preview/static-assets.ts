import { pathToFileURL } from 'node:url';

const ALLOWED_MEDIA_TYPES = new Set([
  'application/javascript; charset=utf-8',
  'application/json; charset=utf-8',
  'application/manifest+json; charset=utf-8',
  'application/wasm',
  'font/otf',
  'font/ttf',
  'font/woff',
  'font/woff2',
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/svg+xml',
  'image/webp',
  'text/css; charset=utf-8',
  'text/html; charset=utf-8',
]);

const LOCAL_PATH_PATTERN =
  /(?:file:\/\/|(?:^|[\s"'(])(?:[A-Za-z]:[\\/]|\\\\[^\\\s]+\\|\/(?:home|Users|private|tmp|var\/folders|workspace|workspaces|runner|builds)\/)|(?:^|\n)\s*at\s+[^\n]*(?:[A-Za-z]:[\\/]|\/(?:home|Users|private|tmp|workspace|workspaces|runner|builds)\/))/iu;

export interface StaticAssetDeclaration {
  readonly body: string | Uint8Array;
  readonly mediaType: string;
  readonly path: string;
}

export interface StaticAsset {
  readonly body: Uint8Array;
  readonly mediaType: string;
  readonly path: string;
}

export interface StaticAssetProvider {
  readonly paths: readonly string[];
  get(path: string): StaticAsset | undefined;
}

export class StaticAssetManifestError extends Error {
  override readonly name = 'StaticAssetManifestError';

  constructor(message: string) {
    super(message);
  }
}

export function createStaticAssetProvider(
  declarations: readonly StaticAssetDeclaration[],
): StaticAssetProvider {
  const assets = new Map<string, StaticAsset>();
  for (const declaration of declarations) {
    validatePath(declaration.path);
    if (assets.has(declaration.path)) {
      throw new StaticAssetManifestError('Static asset paths must be unique');
    }
    if (!ALLOWED_MEDIA_TYPES.has(declaration.mediaType)) {
      throw new StaticAssetManifestError('Static asset media type is not allowed');
    }
    const body =
      typeof declaration.body === 'string'
        ? new TextEncoder().encode(declaration.body)
        : Uint8Array.from(declaration.body);
    if (body.byteLength === 0) {
      throw new StaticAssetManifestError('Static assets must not be empty');
    }
    if (isTextMediaType(declaration.mediaType)) {
      let text: string;
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(body);
      } catch {
        throw new StaticAssetManifestError('Static text asset is not valid UTF-8');
      }
      if (LOCAL_PATH_PATTERN.test(text)) {
        throw new StaticAssetManifestError('Static asset contains local build information');
      }
    }
    const asset = Object.freeze({
      body,
      mediaType: declaration.mediaType,
      path: declaration.path,
    });
    assets.set(declaration.path, asset);
  }
  const root = assets.get('/');
  if (root?.mediaType !== 'text/html; charset=utf-8') {
    throw new StaticAssetManifestError('Static asset manifest must declare an HTML root asset');
  }
  const paths = Object.freeze([...assets.keys()].sort());
  return Object.freeze({
    get(path: string): StaticAsset | undefined {
      const asset = assets.get(path);
      if (asset === undefined) {
        return undefined;
      }
      return Object.freeze({ ...asset, body: Uint8Array.from(asset.body) });
    },
    paths,
  });
}

function validatePath(path: string): void {
  if (
    path !== '/' &&
    (!path.startsWith('/') ||
      path.endsWith('/') ||
      path.includes('\\') ||
      path.includes('?') ||
      path.includes('#') ||
      path.includes('%') ||
      path.includes('\0') ||
      path
        .slice(1)
        .split('/')
        .some((part) => part === '.' || part === '..' || part.length === 0))
  ) {
    throw new StaticAssetManifestError('Static asset path is not canonical');
  }
  if (path.endsWith('.map')) {
    throw new StaticAssetManifestError('Source maps must not be served');
  }
}

function isTextMediaType(mediaType: string): boolean {
  return (
    mediaType.startsWith('text/') ||
    mediaType === 'application/javascript; charset=utf-8' ||
    mediaType === 'application/json; charset=utf-8' ||
    mediaType === 'application/manifest+json; charset=utf-8' ||
    mediaType === 'image/svg+xml'
  );
}

interface ViteManifestEntry {
  readonly assets?: readonly string[];
  readonly css?: readonly string[];
  readonly dynamicImports?: readonly string[];
  readonly file: string;
  readonly imports?: readonly string[];
  readonly isEntry?: boolean;
}

export async function loadPreviewStaticAssets(root?: string): Promise<StaticAssetProvider> {
  const roots =
    root === undefined
      ? [
          new URL('./preview/', import.meta.url),
          new URL('../../preview/dist/', import.meta.url),
          new URL('../../../preview/dist/', import.meta.url),
        ]
      : [new URL('./', pathToFileURL(`${resolveAbsolute(root)}/`))];
  let lastError: unknown;
  for (const candidate of roots) {
    try {
      return await loadViteManifestAssets(candidate);
    } catch (error) {
      lastError = error;
    }
  }
  throw new StaticAssetManifestError(
    `Preview static assets are unavailable${lastError instanceof Error ? `: ${lastError.message}` : ''}`,
  );
}

async function loadViteManifestAssets(root: URL): Promise<StaticAssetProvider> {
  const { readFile } = await import('node:fs/promises');
  let manifest: Record<string, ViteManifestEntry>;
  try {
    manifest = JSON.parse(await readFile(new URL('.vite/manifest.json', root), 'utf8')) as Record<
      string,
      ViteManifestEntry
    >;
  } catch (error) {
    throw new StaticAssetManifestError(
      `Could not read the Vite asset manifest${error instanceof Error ? ` (${error.message})` : ''}`,
    );
  }
  const entry = manifest['index.html'];
  if (entry?.isEntry !== true) {
    throw new StaticAssetManifestError('Vite asset manifest has no index entry');
  }
  const files = new Set<string>();

  const visit = (key: string): void => {
    const declaration = manifest[key];
    if (declaration === undefined) {
      throw new StaticAssetManifestError('Vite asset manifest references an unknown entry');
    }
    addManifestFile(files, declaration.file);
    for (const file of [...(declaration.css ?? []), ...(declaration.assets ?? [])]) {
      addManifestFile(files, file);
    }
    for (const child of [...(declaration.imports ?? []), ...(declaration.dynamicImports ?? [])]) {
      visit(child);
    }
  };

  visit('index.html');

  const declarations: StaticAssetDeclaration[] = [
    {
      body: await readFile(new URL('index.html', root)),
      mediaType: 'text/html; charset=utf-8',
      path: '/',
    },
  ];
  for (const file of [...files].sort()) {
    declarations.push({
      body: await readFile(new URL(file, root)),
      mediaType: mediaTypeFor(file),
      path: `/${file}`,
    });
  }
  return createStaticAssetProvider(declarations);
}

function addManifestFile(files: Set<string>, file: string): void {
  if (
    file.length === 0 ||
    file.startsWith('/') ||
    file.includes('\\') ||
    file.includes('?') ||
    file.includes('#') ||
    file.endsWith('.map') ||
    file.split('/').some((part) => part.length === 0 || part === '.' || part === '..')
  ) {
    throw new StaticAssetManifestError('Vite asset manifest contains an unsafe file path');
  }
  files.add(file);
}

function mediaTypeFor(file: string): string {
  const extension = file.slice(file.lastIndexOf('.')).toLowerCase();
  const mediaTypes: Record<string, string> = {
    '.avif': 'image/avif',
    '.css': 'text/css; charset=utf-8',
    '.gif': 'image/gif',
    '.html': 'text/html; charset=utf-8',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.otf': 'font/otf',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ttf': 'font/ttf',
    '.wasm': 'application/wasm',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
  };
  const mediaType = mediaTypes[extension];
  if (mediaType === undefined) {
    throw new StaticAssetManifestError('Vite asset manifest contains an unsupported file type');
  }
  return mediaType;
}

function resolveAbsolute(path: string): string {
  if (!path.startsWith('/')) {
    throw new StaticAssetManifestError('Static asset root must be absolute');
  }
  return path.endsWith('/') ? path.slice(0, -1) : path;
}

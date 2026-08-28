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

import { type DomainIconKind, ICON_MATCHERS } from './icon-catalog.tsx';

export interface DomainIconDescriptor {
  accessibleLabel: string;
  accentHue: number;
  hue: number;
  kind: DomainIconKind;
  namespace: string;
  resource: string;
  rotation: number;
}

interface IconSource {
  icon?: string;
  label?: string;
  type?: string;
}

export function resolveDomainIcon(source: IconSource): DomainIconDescriptor {
  const identity = source.icon?.trim() || source.label?.trim() || source.type?.trim() || 'quest';
  const separator = identity.indexOf(':');
  const namespace =
    separator < 0 ? source.type?.trim() || 'questspec' : identity.slice(0, separator);
  const resource = separator < 0 ? identity : identity.slice(separator + 1);
  const haystack = `${source.icon ?? ''} ${source.type ?? ''} ${source.label ?? ''}`.toLowerCase();
  const kind = ICON_MATCHERS.find(([pattern]) => pattern.test(haystack))?.[1] ?? 'quest';
  const seed = stableHash(`${namespace}:${resource}`);
  return {
    accessibleLabel:
      source.label?.trim() || humanizeResource(source.icon) || humanize(source.type) || 'Quest',
    accentHue: (seed * 17 + 41) % 360,
    hue: (seed * 29 + 19) % 360,
    kind,
    namespace,
    resource,
    rotation: (seed % 7) - 3,
  };
}

function stableHash(value: string): number {
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function humanizeResource(value: string | undefined): string {
  return humanize(value?.split(':').at(-1));
}

function humanize(value: string | undefined): string {
  return (value ?? '')
    .replaceAll(/[_-]+/gu, ' ')
    .trim()
    .replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
}

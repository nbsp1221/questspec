export type DomainIconKind =
  | 'combat'
  | 'complete'
  | 'experience'
  | 'food'
  | 'knowledge'
  | 'magic'
  | 'material'
  | 'nature'
  | 'place'
  | 'quest'
  | 'tool'
  | 'transport';

export interface DomainIconDescriptor {
  accessibleLabel: string;
  accentHue: number;
  hue: number;
  kind: DomainIconKind;
  monogram: string;
  namespace: string;
  resource: string;
  rotation: number;
}

interface IconSource {
  icon?: string;
  label?: string;
  type?: string;
}

const rules: ReadonlyArray<[RegExp, DomainIconKind]> = [
  [/checkmark|complete|checkbox/u, 'complete'],
  [/xp|experience|level/u, 'experience'],
  [/sword|blade|knife|kill|entity|zombie|skeleton|combat/u, 'combat'],
  [/pickaxe|hammer|wrench|tool|axe|shovel|hoe/u, 'tool'],
  [/book|paper|map|advancement|knowledge/u, 'knowledge'],
  [/rail|track|train|cart|transport/u, 'transport'],
  [/food|bread|cake|apple|meat|fish|stew|crop/u, 'food'],
  [/magic|wand|staff|spell|potion|enchant|arcane/u, 'magic'],
  [/tree|log|wood|plank|sapling|seed|flower|leaf/u, 'nature'],
  [/structure|biome|dimension|location|village|temple/u, 'place'],
  [/ingot|nugget|ore|metal|block|stone|gem|dust|material/u, 'material'],
];

export function resolveDomainIcon(source: IconSource): DomainIconDescriptor {
  const identity = source.icon?.trim() || source.label?.trim() || source.type?.trim() || 'quest';
  const separator = identity.indexOf(':');
  const namespace =
    separator < 0 ? source.type?.trim() || 'questspec' : identity.slice(0, separator);
  const resource = separator < 0 ? identity : identity.slice(separator + 1);
  const haystack = `${source.icon ?? ''} ${source.type ?? ''} ${source.label ?? ''}`.toLowerCase();
  const kind = rules.find(([pattern]) => pattern.test(haystack))?.[1] ?? 'quest';
  const seed = stableHash(`${namespace}:${resource}`);
  return {
    accessibleLabel:
      source.label?.trim() || humanizeResource(source.icon) || humanize(source.type) || 'Quest',
    accentHue: (seed * 17 + 41) % 360,
    hue: (seed * 29 + 19) % 360,
    kind,
    monogram: resourceMonogram(resource),
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

function resourceMonogram(value: string): string {
  const words = value.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  if (words.length > 1) {
    return words
      .slice(0, 2)
      .map((word) => segmenter.segment(word)[Symbol.iterator]().next().value?.segment ?? '')
      .join('')
      .toLocaleUpperCase();
  }
  return [...segmenter.segment(words[0] ?? 'Q')]
    .slice(0, 2)
    .map(({ segment }) => segment)
    .join('')
    .toLocaleUpperCase();
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

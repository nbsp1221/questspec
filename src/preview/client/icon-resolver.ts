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
  kind: DomainIconKind;
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
  [/book|paper|map|scroll|advancement|knowledge/u, 'knowledge'],
  [/rail|track|train|cart|transport/u, 'transport'],
  [/food|bread|cake|apple|meat|fish|stew|crop/u, 'food'],
  [/magic|wand|staff|spell|potion|enchant|arcane/u, 'magic'],
  [/tree|log|wood|plank|sapling|seed|flower|leaf/u, 'nature'],
  [/structure|biome|dimension|location|village|temple/u, 'place'],
  [/ingot|nugget|ore|metal|block|stone|gem|dust|material/u, 'material'],
];

export function resolveDomainIcon(source: IconSource): DomainIconDescriptor {
  const haystack = `${source.icon ?? ''} ${source.type ?? ''} ${source.label ?? ''}`.toLowerCase();
  const kind = rules.find(([pattern]) => pattern.test(haystack))?.[1] ?? 'quest';
  return {
    accessibleLabel:
      source.label?.trim() || humanizeResource(source.icon) || humanize(source.type) || 'Quest',
    kind,
  };
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

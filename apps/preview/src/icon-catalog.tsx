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

export const ICON_MATCHERS: ReadonlyArray<[RegExp, DomainIconKind]> = [
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

/**
 * Blocky isometric cube faces shared by every block-like resource sprite. The
 * sprite grid is 16x16 so every edge lands on a whole pixel boundary.
 */
const cube = (
  <>
    <path className="sprite-top" d="M8 1 15 5 8 9 1 5Z" />
    <path className="sprite-left" d="M1 5 8 9v6L1 11Z" />
    <path className="sprite-right" d="M15 5v6l-7 4V9Z" />
  </>
);

export const ICON_ARTWORK: Record<DomainIconKind, React.ReactNode> = {
  combat: (
    <>
      <path className="sprite-shade" d="M5 0h6v11H5ZM3 10h10v3H3ZM5 12h6v4H5Z" />
      <path className="sprite-left" d="M6 1h4v9H6ZM7 11h2v4H7Z" />
      <path className="sprite-accent" d="M4 11h8v1H4Z" />
      <path className="sprite-top" d="M6 1h2v9H6Z" />
    </>
  ),
  complete: (
    <>
      <path
        className="sprite-shade"
        d="M1 7h4v4H1ZM4 10h4v4H4ZM7 7h3v4H7ZM9 4h3v4H9ZM11 1h4v4h-4Z"
      />
      <path
        className="sprite-check"
        d="M2 8h2v2H2ZM4 10h2v2H4ZM6 8h2v2H6ZM8 6h2v2H8ZM10 4h2v2h-2ZM12 2h2v2h-2Z"
      />
    </>
  ),
  experience: (
    <>
      <path
        className="sprite-shade"
        d="M5 1h6v2H5ZM3 3h10v2H3ZM1 5h14v6H1ZM3 11h10v2H3ZM5 13h6v2H5Z"
      />
      <path
        className="sprite-left"
        d="M6 2h4v2H6ZM4 4h8v2H4ZM2 6h12v4H2ZM4 10h8v2H4ZM6 12h4v2H6Z"
      />
      <path className="sprite-top" d="M5 5h3v3H5Z" />
    </>
  ),
  food: (
    <>
      <path className="sprite-shade" d="M2 4h12v11H2ZM5 1h3v3H5Z" />
      <path className="sprite-left" d="M3 5h10v9H3Z" />
      <path className="sprite-accent" d="M8 1h4v3H8Z" />
      <path className="sprite-top" d="M5 6h3v3H5Z" />
    </>
  ),
  knowledge: (
    <>
      <path className="sprite-shade" d="M1 2h14v13H1Z" />
      <path className="sprite-left" d="M2 3h12v11H2Z" />
      <path className="sprite-top" d="M4 4h8v9H4Z" />
      <path className="sprite-detail" d="M5 6h6v1H5ZM5 8h6v1H5ZM5 10h4v1H5Z" />
    </>
  ),
  magic: (
    <>
      <path className="sprite-shade" d="M6 0h4v4H6ZM3 3h10v13H3Z" />
      <path className="sprite-left" d="M7 1h2v3H7ZM4 4h8v11H4Z" />
      <path className="sprite-accent" d="M5 7h6v7H5Z" />
      <path className="sprite-top" d="M6 8h2v3H6Z" />
    </>
  ),
  material: (
    <>
      {cube}
      <path className="sprite-detail" d="M3 7h2v2H3ZM10 8h2v2h-2ZM6 11h2v2H6Z" />
    </>
  ),
  nature: (
    <>
      <path className="sprite-shade" d="M4 1h8v4H4ZM2 4h12v5H2ZM4 8h8v4H4ZM6 11h4v5H6Z" />
      <path className="sprite-left" d="M5 2h6v3H5ZM3 5h10v3H3ZM5 8h6v3H5Z" />
      <path className="sprite-top" d="M6 3h3v2H6Z" />
      <path className="sprite-trunk" d="M7 11h2v4H7Z" />
    </>
  ),
  place: (
    <>
      {cube}
      <path className="sprite-detail" d="M2 8h3v1H2ZM11 9h3v1h-3ZM6 12h4v1H6Z" />
    </>
  ),
  quest: (
    <>
      {cube}
      <path className="sprite-detail" d="M7 9h2v5H7Z" />
    </>
  ),
  tool: (
    <>
      <path className="sprite-shade" d="M1 1h6v4H1ZM9 1h6v4H9ZM5 4h6v4H5ZM6 7h4v9H6Z" />
      <path className="sprite-left" d="M2 2h4v2H2ZM10 2h4v2h-4ZM6 5h4v2H6ZM7 7h2v8H7Z" />
      <path className="sprite-top" d="M2 2h12v1H2Z" />
    </>
  ),
  transport: (
    <>
      {cube}
      <path className="sprite-detail" d="M1 7h14v1H1ZM1 10h14v1H1Z" />
    </>
  ),
};

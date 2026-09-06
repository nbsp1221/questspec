export interface TargetProfileSource {
  dataVersion: 13;
  loader: 'neoforge@21.1.248';
  minecraft: '1.21.1';
  questSystem: 'ftbquests@2101.1.33';
  serializer: 'ftblibrary@2101.1.35';
}

export interface LocaleSource {
  default: string;
  supported: string[];
}

export type LocalizedTextSource = Record<string, string>;
export type LocalizedLinesSource = Record<string, string[]>;

export interface ItemStackObjectSource {
  components?: Record<string, { snbt: string }>;
  id: string;
}

export type ItemStackSource = ItemStackObjectSource | string;

export interface ChapterGroupSource {
  key: string;
  title?: LocalizedTextSource;
}

export interface PointSource {
  x: number;
  y: number;
}

export interface TaskSourceBase {
  disableToast?: boolean;
  icon?: ItemStackSource;
  key: string;
  optional?: boolean;
  tags?: string[];
  title?: LocalizedTextSource;
}

export interface ItemTaskSource extends TaskSourceBase {
  consumeItems?: boolean;
  count?: number;
  item: ItemStackSource;
  matchComponents?: 'fuzzy' | 'none' | 'strict';
  onlyFromCrafting?: boolean;
  taskScreenOnly?: boolean;
  type: 'item';
}

export interface AdvancementTaskSource extends TaskSourceBase {
  advancement: string;
  criterion?: string;
  type: 'advancement';
}

export interface CheckmarkTaskSource extends TaskSourceBase {
  type: 'checkmark';
}

export interface KillTaskSource extends TaskSourceBase {
  count: number;
  customName?: string;
  entity: string;
  entityTag?: string;
  nbtFilter?: { snbt: string };
  type: 'kill';
}

export interface StructureTaskSource extends TaskSourceBase {
  structure: string;
  type: 'structure';
}

export interface StatTaskSource extends TaskSourceBase {
  count: number;
  stat: string;
  type: 'stat';
}

export interface BiomeTaskSource extends TaskSourceBase {
  biome: string;
  type: 'biome';
}

export interface DimensionTaskSource extends TaskSourceBase {
  dimension: string;
  type: 'dimension';
}

export type ObservationType =
  | 'block'
  | 'block_entity'
  | 'block_entity_type'
  | 'block_state'
  | 'block_tag'
  | 'entity_type'
  | 'entity_type_tag';

export interface ObservationTaskSource extends TaskSourceBase {
  observationType: ObservationType;
  target: string;
  timer?: number;
  type: 'observation';
}

export type TaskSource =
  | AdvancementTaskSource
  | BiomeTaskSource
  | CheckmarkTaskSource
  | DimensionTaskSource
  | ItemTaskSource
  | KillTaskSource
  | ObservationTaskSource
  | StatTaskSource
  | StructureTaskSource;

export interface RewardSourceBase {
  autoClaim?: 'default' | 'disabled' | 'enabled';
  disableRewardScreenBlur?: boolean;
  excludeFromClaimAll?: boolean;
  icon?: ItemStackSource;
  ignoreRewardBlocking?: boolean;
  key: string;
  tags?: string[];
  teamReward?: 'default' | 'disabled' | 'enabled';
  title?: LocalizedTextSource;
}

export interface XpRewardSource extends RewardSourceBase {
  type: 'xp';
  xp: number;
}

export interface XpLevelsRewardSource extends RewardSourceBase {
  levels: number;
  type: 'xp_levels';
}

export interface ItemRewardSource extends RewardSourceBase {
  count?: number;
  item: ItemStackSource;
  onlyOne?: boolean;
  randomBonus?: number;
  type: 'item';
}

export interface TableRewardSourceBase extends Omit<
  RewardSourceBase,
  'excludeFromClaimAll' | 'ignoreRewardBlocking'
> {
  table: string;
}

export interface RandomRewardSource extends TableRewardSourceBase {
  type: 'random';
}

export interface LootRewardSource extends TableRewardSourceBase {
  type: 'loot';
}

export interface ChoiceRewardSource extends TableRewardSourceBase {
  type: 'choice';
}

export type RewardSource =
  | ChoiceRewardSource
  | ItemRewardSource
  | LootRewardSource
  | RandomRewardSource
  | XpLevelsRewardSource
  | XpRewardSource;

export type TerminalRewardSource = ItemRewardSource | XpLevelsRewardSource | XpRewardSource;

export type RewardTableEntrySource = TerminalRewardSource & { weight?: number };

export interface LootCrateSource {
  color?: number;
  drops?: { boss?: number; monster?: number; passive?: number };
  glow?: boolean;
  itemName?: string;
  stringId: string;
}

export interface RewardTableSource {
  emptyWeight?: number;
  entries: RewardTableEntrySource[];
  filename?: string;
  hideTooltip?: boolean;
  icon?: ItemStackSource;
  key: string;
  lootCrate?: LootCrateSource;
  lootSize?: number;
  lootTable?: string;
  tags?: string[];
  title?: LocalizedTextSource;
  useTitle?: boolean;
}

export type DependencyRequirement =
  | 'all_completed'
  | 'all_started'
  | 'one_completed'
  | 'one_started';

export interface QuestSource {
  dependencies?: string[];
  dependencyControlPoints?: Record<string, PointSource[]>;
  dependencyRequirement?: DependencyRequirement;
  description?: LocalizedLinesSource;
  hideDependencyLines?: boolean;
  hideUntilDependenciesVisible?: boolean;
  icon?: ItemStackSource;
  key: string;
  minWidth?: number;
  optional?: boolean;
  rewards?: RewardSource[];
  shape?: string;
  size?: number;
  subtitle?: LocalizedTextSource;
  tasks: TaskSource[];
  title: LocalizedTextSource;
  x: number;
  y: number;
}

export interface ChapterSource {
  defaultHideDependencyLines?: boolean;
  defaultQuestShape?: string;
  filename: string;
  group: string;
  icon: ItemStackSource;
  key: string;
  progressionMode?: 'default' | 'flexible' | 'linear';
  quests: QuestSource[];
  subtitle?: LocalizedLinesSource;
  title: LocalizedTextSource;
}

export interface QuestbookSettingsSource {
  defaultAutoClaimRewards?: 'disabled' | 'enabled';
  defaultConsumeItems?: boolean;
  defaultQuestDisableRecipeViewing?: boolean;
  defaultQuestShape?: string;
  defaultRewardTeam?: boolean;
  detectionDelay?: number;
  disableGui?: boolean;
  dropLootCrates?: boolean;
  emergencyItemsCooldown?: number;
  gridScale?: number;
  icon?: ItemStackSource;
  lockMessage?: string;
  pauseGame?: boolean;
  progressionMode?: 'default' | 'flexible' | 'linear';
  showLockIcons?: boolean;
}

export interface QuestSpecSource {
  chapters: ChapterSource[];
  groups: ChapterGroupSource[];
  locales: LocaleSource;
  questspec: 1;
  rewardTables?: RewardTableSource[];
  settings?: QuestbookSettingsSource;
  target: TargetProfileSource;
}

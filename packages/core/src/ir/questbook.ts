import type {
  DependencyRequirement,
  LocalizedLinesSource,
  LocalizedTextSource,
  ObservationType,
  PointSource,
  QuestbookSettingsSource,
  TargetProfileSource,
} from '../spec/types.ts';

export interface ChapterGroup {
  key: string;
  title: LocalizedTextSource;
}

interface QuestObjectIdentity {
  key: string;
  localKey: string;
}

export interface ItemStack {
  components: Record<string, string>;
  id: string;
}

interface TaskBase extends QuestObjectIdentity {
  disableToast: boolean;
  icon?: ItemStack;
  optional: boolean;
  tags: string[];
  title: LocalizedTextSource;
}

export interface ItemTask extends TaskBase {
  consumeItems?: boolean;
  count: number;
  item: ItemStack;
  matchComponents: 'fuzzy' | 'none' | 'strict';
  onlyFromCrafting?: boolean;
  taskScreenOnly: boolean;
  type: 'item';
}

export interface AdvancementTask extends TaskBase {
  advancement: string;
  criterion: string;
  type: 'advancement';
}

export interface CheckmarkTask extends TaskBase {
  type: 'checkmark';
}

export interface KillTask extends TaskBase {
  count: number;
  customName?: string;
  entity: string;
  entityTag?: string;
  nbtFilter?: string;
  type: 'kill';
}

export interface StructureTask extends TaskBase {
  structure: string;
  type: 'structure';
}

export interface StatTask extends TaskBase {
  count: number;
  stat: string;
  type: 'stat';
}

export interface BiomeTask extends TaskBase {
  biome: string;
  type: 'biome';
}

export interface DimensionTask extends TaskBase {
  dimension: string;
  type: 'dimension';
}

export interface ObservationTask extends TaskBase {
  observationType: ObservationType;
  target: string;
  timer: number;
  type: 'observation';
}

export type Task =
  | AdvancementTask
  | BiomeTask
  | CheckmarkTask
  | DimensionTask
  | ItemTask
  | KillTask
  | ObservationTask
  | StatTask
  | StructureTask;

interface RewardBase extends QuestObjectIdentity {
  autoClaim: 'default' | 'disabled' | 'enabled';
  disableRewardScreenBlur: boolean;
  excludeFromClaimAll: boolean;
  icon?: ItemStack;
  ignoreRewardBlocking: boolean;
  tags: string[];
  teamReward: 'default' | 'disabled' | 'enabled';
  title: LocalizedTextSource;
}

export interface XpReward extends RewardBase {
  type: 'xp';
  xp: number;
}

export interface XpLevelsReward extends RewardBase {
  levels: number;
  type: 'xp_levels';
}

export interface ItemReward extends RewardBase {
  count: number;
  item: ItemStack;
  onlyOne: boolean;
  randomBonus: number;
  type: 'item';
}

export interface TableReward extends RewardBase {
  excludeFromClaimAll: true;
  ignoreRewardBlocking: false;
  table: string;
  type: 'choice' | 'loot' | 'random';
}

export type Reward = ItemReward | TableReward | XpLevelsReward | XpReward;
export type TerminalReward = ItemReward | XpLevelsReward | XpReward;

export interface WeightedReward {
  reward: TerminalReward;
  weight: number;
}

export interface LootCrate {
  color: number;
  drops: { boss: number; monster: number; passive: number };
  glow: boolean;
  itemName?: string;
  stringId: string;
}

export interface RewardTable extends QuestObjectIdentity {
  emptyWeight: number;
  entries: WeightedReward[];
  filename: string;
  hideTooltip: boolean;
  icon?: ItemStack;
  lootCrate?: LootCrate;
  lootSize: number;
  lootTable?: string;
  tags: string[];
  title: LocalizedTextSource;
  useTitle: boolean;
}

export interface Quest extends QuestObjectIdentity {
  dependencies: string[];
  dependencyControlPoints: Record<string, PointSource[]>;
  dependencyRequirement: DependencyRequirement;
  description: LocalizedLinesSource;
  hideDependencyLines?: boolean;
  hideUntilDependenciesVisible?: boolean;
  icon?: ItemStack;
  minWidth: number;
  optional: boolean;
  rewards: Reward[];
  shape: string;
  size: number;
  subtitle: LocalizedTextSource;
  tasks: Task[];
  title: LocalizedTextSource;
  x: number;
  y: number;
}

export interface Chapter extends QuestObjectIdentity {
  defaultHideDependencyLines: boolean;
  defaultQuestShape: string;
  filename: string;
  group: string;
  icon: ItemStack;
  progressionMode: 'default' | 'flexible' | 'linear';
  quests: Quest[];
  subtitle: LocalizedLinesSource;
  title: LocalizedTextSource;
}

export interface Questbook {
  chapters: Chapter[];
  defaultLocale: string;
  groups: ChapterGroup[];
  locales: string[];
  rewardTables: RewardTable[];
  settings: Omit<QuestbookSettingsSource, 'icon'> & { icon?: ItemStack };
  target: TargetProfileSource;
}

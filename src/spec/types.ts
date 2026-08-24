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

export interface ChapterGroupSource {
  key: string;
  title?: LocalizedTextSource;
}

export interface PointSource {
  x: number;
  y: number;
}

interface TaskSourceBase {
  key: string;
  optional?: boolean;
  title?: LocalizedTextSource;
}

export interface ItemTaskSource extends TaskSourceBase {
  consumeItems?: boolean;
  count?: number;
  item: string;
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

export type TaskSource = AdvancementTaskSource | ItemTaskSource;

interface RewardSourceBase {
  autoClaim?: 'default' | 'disabled' | 'enabled';
  key: string;
  title?: LocalizedTextSource;
}

export interface XpRewardSource extends RewardSourceBase {
  type: 'xp';
  xp: number;
}

export type RewardSource = XpRewardSource;

export interface QuestSource {
  dependencies?: string[];
  dependencyControlPoints?: Record<string, PointSource[]>;
  description?: LocalizedLinesSource;
  hideDependencyLines?: boolean;
  hideUntilDependenciesVisible?: boolean;
  key: string;
  optional?: boolean;
  rewards?: RewardSource[];
  shape?: string;
  size?: number;
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
  icon: string;
  key: string;
  progressionMode?: 'default' | 'flexible' | 'linear';
  quests: QuestSource[];
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
  icon?: string;
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
  settings?: QuestbookSettingsSource;
  target: TargetProfileSource;
}

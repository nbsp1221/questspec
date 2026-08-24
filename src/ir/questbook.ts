import type {
  LocalizedLinesSource,
  LocalizedTextSource,
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

export type Task = AdvancementTask | ItemTask;

interface RewardBase extends QuestObjectIdentity {
  autoClaim: 'default' | 'disabled' | 'enabled';
  disableRewardScreenBlur: boolean;
  excludeFromClaimAll: boolean;
  icon?: ItemStack;
  ignoreRewardBlocking: boolean;
  tags: string[];
  teamReward?: boolean;
  title: LocalizedTextSource;
}

export interface XpReward extends RewardBase {
  type: 'xp';
  xp: number;
}

export type Reward = XpReward;

export interface Quest extends QuestObjectIdentity {
  dependencies: string[];
  dependencyControlPoints: Record<string, PointSource[]>;
  description: LocalizedLinesSource;
  hideDependencyLines?: boolean;
  hideUntilDependenciesVisible?: boolean;
  optional: boolean;
  rewards: Reward[];
  shape: string;
  size: number;
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
  title: LocalizedTextSource;
}

export interface Questbook {
  chapters: Chapter[];
  defaultLocale: string;
  groups: ChapterGroup[];
  locales: string[];
  settings: Omit<QuestbookSettingsSource, 'icon'> & { icon?: ItemStack };
  target: TargetProfileSource;
}

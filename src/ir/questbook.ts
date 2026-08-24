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

export interface ItemTask extends QuestObjectIdentity {
  consumeItems?: boolean;
  count: number;
  item: string;
  matchComponents: 'fuzzy' | 'none' | 'strict';
  onlyFromCrafting?: boolean;
  optional: boolean;
  taskScreenOnly: boolean;
  title: LocalizedTextSource;
  type: 'item';
}

export interface AdvancementTask extends QuestObjectIdentity {
  advancement: string;
  criterion: string;
  optional: boolean;
  title: LocalizedTextSource;
  type: 'advancement';
}

export type Task = AdvancementTask | ItemTask;

export interface XpReward extends QuestObjectIdentity {
  autoClaim: 'default' | 'disabled' | 'enabled';
  title: LocalizedTextSource;
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
  icon: string;
  progressionMode: 'default' | 'flexible' | 'linear';
  quests: Quest[];
  title: LocalizedTextSource;
}

export interface Questbook {
  chapters: Chapter[];
  defaultLocale: string;
  groups: ChapterGroup[];
  locales: string[];
  settings: QuestbookSettingsSource;
  target: TargetProfileSource;
}

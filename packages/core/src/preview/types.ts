export interface PreviewDiagnostic {
  file?: string;
  message: string;
  questId?: string;
  severity: 'error' | 'warning';
}

export interface PreviewEntry {
  count?: number;
  icon?: string;
  label: string;
  type: string;
}

export interface PreviewQuest {
  dependencies: string[];
  description: string[];
  hideDependencyLines: boolean;
  icon?: string;
  id: string;
  optional: boolean;
  rewards: PreviewEntry[];
  shape: string;
  size: number;
  subtitle?: string;
  tasks: PreviewEntry[];
  title: string;
  x: number;
  y: number;
}

export interface PreviewChapter {
  filename: string;
  groupId?: string;
  icon?: string;
  id: string;
  order: number;
  quests: PreviewQuest[];
  subtitle: string[];
  title: string;
}

export interface PreviewGroup {
  id: string;
  order: number;
  title: string;
}

export interface PreviewLocale {
  chapters: PreviewChapter[];
  groups: PreviewGroup[];
}

export type PreviewChapterSummary = Omit<PreviewChapter, 'quests'> & { questCount?: number };

export interface PreviewLocaleIndex {
  chapters: PreviewChapterSummary[];
  groups: PreviewGroup[];
}

export interface PreviewQuestReference {
  chapterId: string;
  dependencies: string[];
  title: string;
}

export interface QuestPreview {
  availableLocales: string[];
  chapter?: PreviewChapter;
  diagnostics: PreviewDiagnostic[];
  directory: string;
  locale: PreviewLocaleIndex;
  questIndex: Record<string, PreviewQuestReference>;
  selectedLocale: string;
  stats: { chapters: number; dependencies: number; groups: number; quests: number };
}

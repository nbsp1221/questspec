export interface PreviewDiagnostic {
  file?: string;
  message: string;
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

export interface QuestPreview {
  diagnostics: PreviewDiagnostic[];
  directory: string;
  locales: Record<string, PreviewLocale>;
  selectedLocale: string;
  stats: { chapters: number; dependencies: number; groups: number; quests: number };
}

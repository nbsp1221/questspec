import type {
  PreviewModelV1,
  PreviewNotice,
  PreviewPath,
  PreviewSchemaVersion,
  PreviewSourceSpan,
} from './model.ts';

export interface PreviewDiagnostic {
  readonly code: string;
  readonly displayFile?: string;
  readonly message: string;
  readonly path: readonly (number | string)[];
  readonly severity: 'error' | 'info' | 'warning';
  readonly span?: PreviewSourceSpan;
}

export interface PreviewProvenance {
  readonly fieldSpans: Readonly<Record<string, PreviewSourceSpan>>;
  readonly path: PreviewPath;
  readonly span?: PreviewSourceSpan;
}

export interface PreviewCurrentInputState {
  readonly catalogState: 'current' | 'not-requested' | 'unavailable';
  readonly sourceState: 'normalized' | 'not-normalizable';
  readonly validationState: 'invalid' | 'unavailable' | 'valid';
}

export interface PreviewRetainedModelState {
  readonly graphPartial: boolean;
  readonly sourceRevision: number;
  readonly state: 'current' | 'stale';
  readonly wasSemanticallyValid: boolean;
}

export interface PreviewSnapshotV1 {
  readonly currentInput: PreviewCurrentInputState;
  readonly diagnostics: readonly PreviewDiagnostic[];
  readonly generation: number;
  readonly model: PreviewModelV1 | null;
  readonly modelNotices: readonly PreviewNotice[];
  readonly provenanceByInstanceId: Readonly<Record<string, PreviewProvenance>>;
  readonly retainedModel: PreviewRetainedModelState | null;
  readonly schemaVersion: PreviewSchemaVersion;
  readonly sessionNotices: readonly PreviewNotice[];
}

export type PreviewSnapshotStateKind = 'current' | 'empty' | 'stale';

export interface PreviewRefreshEventV1 {
  readonly generation: number;
  readonly schemaVersion: PreviewSchemaVersion;
  readonly stateKind: PreviewSnapshotStateKind;
  readonly type: 'refresh';
}

export type PreviewEventV1 = PreviewRefreshEventV1;

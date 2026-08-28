import {
  PREVIEW_SCHEMA_VERSION,
  type PreviewDiagnostic,
  type PreviewEventV1,
  type PreviewModelV1,
  type PreviewNotice,
  type PreviewProvenance,
  type PreviewSnapshotStateKind,
  type PreviewSnapshotV1,
} from '@questspec/preview-contract';

export type PreviewEvaluationPhase = 'runtime' | 'startup';

export interface PreviewEvaluationRequest {
  readonly catalogRequested: boolean;
  readonly phase: PreviewEvaluationPhase;
  readonly revision: number;
}

export interface PreviewNormalizedSourceOutcome {
  readonly diagnostics: readonly PreviewDiagnostic[];
  readonly kind: 'normalized';
  readonly model: PreviewModelV1;
  readonly modelNotices: readonly PreviewNotice[];
  readonly provenanceByInstanceId: Readonly<Record<string, PreviewProvenance>>;
  readonly semanticallyValid: boolean;
}

export interface PreviewNotNormalizableSourceOutcome {
  readonly diagnostics: readonly PreviewDiagnostic[];
  readonly kind: 'not-normalizable';
}

export type PreviewSourceOutcome =
  | PreviewNormalizedSourceOutcome
  | PreviewNotNormalizableSourceOutcome;

export type PreviewCatalogOutcome =
  | {
      readonly kind: 'not-requested';
    }
  | {
      readonly diagnostics: readonly PreviewDiagnostic[];
      readonly kind: 'current';
    }
  | {
      readonly kind: 'unavailable';
      readonly notices: readonly [PreviewNotice, ...PreviewNotice[]];
    };

/**
 * One result represents a coherent source × catalog capture. `inputIdentity` must
 * identify the complete captured byte/status pair and be stable for equal pairs.
 */
export interface PreviewSessionEvaluation {
  readonly catalog: PreviewCatalogOutcome;
  readonly inputIdentity: string;
  readonly sessionNotices?: readonly PreviewNotice[];
  readonly source: PreviewSourceOutcome;
}

export interface PreviewSessionEvaluator {
  evaluate(request: PreviewEvaluationRequest): Promise<PreviewSessionEvaluation>;
}

export type PreviewSessionSubscriber = (event: PreviewEventV1) => void;

export interface PreviewSessionOptions {
  readonly catalogRequested?: boolean;
}

interface PublicationWaiter {
  readonly reject: (reason: unknown) => void;
  readonly resolve: (generation: number) => void;
  readonly revision: number;
}

const staleNotice: PreviewNotice = {
  code: 'PREVIEW_LAST_NORMALIZED_SNAPSHOT',
  message: 'Showing the last normalized snapshot because the current source cannot normalize',
  path: [],
  severity: 'warning',
};

export class PreviewSession {
  readonly #catalogRequested: boolean;
  readonly #evaluator: PreviewSessionEvaluator;
  readonly #subscribers = new Set<PreviewSessionSubscriber>();
  readonly #waiters = new Set<PublicationWaiter>();
  #closed = false;
  #draining = false;
  #generation = 0;
  #latestPhase: PreviewEvaluationPhase = 'runtime';
  #publishedInputIdentity: string | undefined;
  #requestedRevision = 0;
  #snapshot: PreviewSnapshotV1;

  constructor(evaluator: PreviewSessionEvaluator, options: PreviewSessionOptions = {}) {
    this.#evaluator = evaluator;
    this.#catalogRequested = options.catalogRequested ?? false;
    this.#snapshot = freezeClone({
      currentInput: {
        catalogState: this.#catalogRequested ? 'unavailable' : 'not-requested',
        sourceState: 'not-normalizable',
        validationState: 'invalid',
      },
      diagnostics: [],
      generation: 0,
      model: null,
      modelNotices: [],
      provenanceByInstanceId: {},
      retainedModel: null,
      schemaVersion: PREVIEW_SCHEMA_VERSION,
      sessionNotices: [],
    });
  }

  get closed(): boolean {
    return this.#closed;
  }

  get generation(): number {
    return this.#generation;
  }

  get requestedRevision(): number {
    return this.#requestedRevision;
  }

  getSnapshot(): PreviewSnapshotV1 {
    return freezeClone(this.#snapshot);
  }

  refresh(phase: PreviewEvaluationPhase = 'runtime'): Promise<number> {
    if (this.#closed) {
      return Promise.reject(new Error('Preview session is closed'));
    }
    this.#requestedRevision += 1;
    this.#latestPhase = phase;
    const revision = this.#requestedRevision;
    const result = new Promise<number>((resolve, reject) => {
      this.#waiters.add({ reject, resolve, revision });
    });
    this.#startDrain();
    return result;
  }

  subscribe(subscriber: PreviewSessionSubscriber): () => void {
    if (this.#closed) {
      return () => undefined;
    }
    this.#subscribers.add(subscriber);
    let subscribed = true;
    return () => {
      if (!subscribed) {
        return;
      }
      subscribed = false;
      this.#subscribers.delete(subscriber);
    };
  }

  close(): void {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    this.#subscribers.clear();
    const error = new Error('Preview session is closed');
    for (const waiter of this.#waiters) {
      waiter.reject(error);
    }
    this.#waiters.clear();
  }

  #startDrain(): void {
    if (this.#draining || this.#closed) {
      return;
    }
    this.#draining = true;
    void this.#drain();
  }

  async #drain(): Promise<void> {
    while (!this.#closed) {
      const revision = this.#requestedRevision;
      const phase = this.#latestPhase;
      let evaluation: PreviewSessionEvaluation;
      try {
        evaluation = await this.#evaluator.evaluate({
          catalogRequested: this.#catalogRequested,
          phase,
          revision,
        });
      } catch (error) {
        if (this.#closed) {
          break;
        }
        if (revision !== this.#requestedRevision) {
          continue;
        }
        this.#rejectWaiters(revision, error);
        this.#draining = false;
        return;
      }
      if (this.#closed) {
        break;
      }
      if (revision !== this.#requestedRevision) {
        continue;
      }

      if (evaluation.inputIdentity !== this.#publishedInputIdentity) {
        this.#publish(evaluation, revision);
        this.#publishedInputIdentity = evaluation.inputIdentity;
      }
      this.#resolveWaiters(revision);
      if (revision === this.#requestedRevision) {
        this.#draining = false;
        return;
      }
    }
    this.#draining = false;
  }

  #publish(evaluation: PreviewSessionEvaluation, revision: number): void {
    const sourceDiagnostics = evaluation.source.diagnostics;
    const resourceDiagnostics =
      evaluation.catalog.kind === 'current' ? evaluation.catalog.diagnostics : [];
    const diagnostics = [...sourceDiagnostics, ...resourceDiagnostics];
    const sourceNormalized = evaluation.source.kind === 'normalized';
    const retained = sourceNormalized ? this.#currentRetention(evaluation.source, revision) : null;
    const previousRetained = this.#snapshot.retainedModel;
    const hasRetainedModel = this.#snapshot.model !== null && previousRetained !== null;
    const model = sourceNormalized ? evaluation.source.model : this.#snapshot.model;
    const provenance = sourceNormalized
      ? evaluation.source.provenanceByInstanceId
      : this.#snapshot.provenanceByInstanceId;
    const modelNotices = sourceNormalized
      ? evaluation.source.modelNotices
      : this.#snapshot.modelNotices;
    const retainedModel =
      retained ??
      (hasRetainedModel
        ? {
            ...previousRetained,
            state: 'stale' as const,
          }
        : null);
    const catalogState = catalogStateOf(evaluation.catalog);
    const validationState = validationStateOf(
      sourceNormalized,
      sourceDiagnostics.length > 0,
      evaluation.catalog,
    );
    const sessionNotices = [
      ...(evaluation.sessionNotices ?? []),
      ...(evaluation.catalog.kind === 'unavailable' ? evaluation.catalog.notices : []),
      ...(!sourceNormalized && hasRetainedModel ? [staleNotice] : []),
    ];

    this.#generation += 1;
    this.#snapshot = freezeClone({
      currentInput: {
        catalogState,
        sourceState: sourceNormalized ? 'normalized' : 'not-normalizable',
        validationState,
      },
      diagnostics,
      generation: this.#generation,
      model,
      modelNotices,
      provenanceByInstanceId: provenance,
      retainedModel,
      schemaVersion: PREVIEW_SCHEMA_VERSION,
      sessionNotices,
    });

    const event = freezeClone({
      generation: this.#generation,
      schemaVersion: PREVIEW_SCHEMA_VERSION,
      stateKind: stateKindOf(this.#snapshot),
      type: 'refresh' as const,
    });
    for (const subscriber of this.#subscribers) {
      if (this.#closed) {
        break;
      }
      subscriber(freezeClone(event));
    }
  }

  #currentRetention(
    source: PreviewNormalizedSourceOutcome,
    revision: number,
  ): NonNullable<PreviewSnapshotV1['retainedModel']> {
    return {
      graphPartial: source.model.graph.availability === 'partial',
      sourceRevision: revision,
      state: 'current',
      wasSemanticallyValid: source.semanticallyValid,
    };
  }

  #resolveWaiters(revision: number): void {
    for (const waiter of this.#waiters) {
      if (waiter.revision > revision) {
        continue;
      }
      this.#waiters.delete(waiter);
      waiter.resolve(this.#generation);
    }
  }

  #rejectWaiters(revision: number, error: unknown): void {
    for (const waiter of this.#waiters) {
      if (waiter.revision > revision) {
        continue;
      }
      this.#waiters.delete(waiter);
      waiter.reject(error);
    }
  }
}

function catalogStateOf(
  catalog: PreviewCatalogOutcome,
): PreviewSnapshotV1['currentInput']['catalogState'] {
  return catalog.kind === 'not-requested' ? 'not-requested' : catalog.kind;
}

function validationStateOf(
  sourceNormalized: boolean,
  hasSourceDiagnostics: boolean,
  catalog: PreviewCatalogOutcome,
): PreviewSnapshotV1['currentInput']['validationState'] {
  if (!sourceNormalized || hasSourceDiagnostics) {
    return 'invalid';
  }
  if (catalog.kind === 'unavailable') {
    return 'unavailable';
  }
  if (catalog.kind === 'current' && catalog.diagnostics.length > 0) {
    return 'invalid';
  }
  return 'valid';
}

function stateKindOf(snapshot: PreviewSnapshotV1): PreviewSnapshotStateKind {
  if (snapshot.model === null) {
    return 'empty';
  }
  return snapshot.retainedModel?.state ?? 'empty';
}

function freezeClone<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}

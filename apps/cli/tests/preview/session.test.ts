import type {
  PreviewDiagnostic,
  PreviewModelV1,
  PreviewNotice,
  PreviewProvenance,
} from '@questspec/preview-contract';
import { validateQuestbookWithGraph } from '@questspec/core';
import { describe, expect, it } from 'vitest';
import { projectPreviewModel } from '../../src/preview/model.ts';
import {
  type PreviewCatalogOutcome,
  type PreviewEvaluationRequest,
  PreviewSession,
  type PreviewSessionEvaluation,
  type PreviewSessionEvaluator,
  type PreviewSourceOutcome,
} from '../../src/preview/session.ts';
import { makeBook, makeChapter, makeQuest } from './fixtures.ts';

class Deferred<T> {
  readonly promise: Promise<T>;
  #reject!: (reason: unknown) => void;
  #resolve!: (value: T) => void;

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.#resolve = resolve;
      this.#reject = reject;
    });
  }

  reject(reason: unknown): void {
    this.#reject(reason);
  }

  resolve(value: T): void {
    this.#resolve(value);
  }
}

class ControlledEvaluator implements PreviewSessionEvaluator {
  readonly calls: Array<{
    readonly deferred: Deferred<PreviewSessionEvaluation>;
    readonly request: PreviewEvaluationRequest;
  }> = [];

  evaluate(request: PreviewEvaluationRequest): Promise<PreviewSessionEvaluation> {
    const deferred = new Deferred<PreviewSessionEvaluation>();
    this.calls.push({ deferred, request });
    return deferred.promise;
  }
}

const sourceDiagnostic = diagnostic('SOURCE_INVALID', 3);
const resourceDiagnostic = diagnostic('RESOURCE_MISSING', 7);
const catalogNotice = notice('PREVIEW_CATALOG_UNAVAILABLE');
const modelNotice = notice('PREVIEW_UNKNOWN_SHAPE');

function diagnostic(code: string, offset: number): PreviewDiagnostic {
  return {
    code,
    displayFile: 'quests.yml',
    message: code.toLowerCase(),
    path: ['chapters', 0],
    severity: 'error',
    span: {
      end: { column: 2, line: 1, offset: offset + 1 },
      start: { column: 1, line: 1, offset },
    },
  };
}

function notice(code: string): PreviewNotice {
  return { code, message: code.toLowerCase(), path: [], severity: 'warning' };
}

function model(key: string, graph: 'available' | 'partial' | 'unavailable' = 'available') {
  const book = makeBook([makeChapter(key, [makeQuest(`${key}.quest`)])]);
  const validated = validateQuestbookWithGraph(book).graphState;
  const graphState =
    graph === 'unavailable'
      ? ({ graph: null, kind: 'ambiguous', partial: false, summary: null } as const)
      : validated.kind === 'available'
        ? { ...validated, partial: graph === 'partial' }
        : validated;
  return projectPreviewModel(book, graphState).model;
}

function provenance(offset: number): Readonly<Record<string, PreviewProvenance>> {
  return {
    'chapters/0/quests/0': {
      fieldSpans: {},
      path: ['chapters', 0, 'quests', 0],
      span: {
        end: { column: 2, line: 1, offset: offset + 1 },
        start: { column: 1, line: 1, offset },
      },
    },
  };
}

function normalized(
  previewModel: PreviewModelV1,
  diagnostics: readonly PreviewDiagnostic[] = [],
  sourceProvenance = provenance(10),
): PreviewSourceOutcome {
  return {
    diagnostics,
    kind: 'normalized',
    model: previewModel,
    modelNotices: [modelNotice],
    provenanceByInstanceId: sourceProvenance,
    semanticallyValid: diagnostics.length === 0,
  };
}

function notNormalizable(
  diagnostics: readonly PreviewDiagnostic[] = [sourceDiagnostic],
): PreviewSourceOutcome {
  return { diagnostics, kind: 'not-normalizable' };
}

function evaluation(
  inputIdentity: string,
  source: PreviewSourceOutcome,
  catalog: PreviewCatalogOutcome,
): PreviewSessionEvaluation {
  return { catalog, inputIdentity, source };
}

async function waitForCalls(evaluator: ControlledEvaluator, count: number): Promise<void> {
  for (let attempt = 0; attempt < 20 && evaluator.calls.length < count; attempt += 1) {
    await Promise.resolve();
  }
  expect(evaluator.calls).toHaveLength(count);
}

async function publish(
  session: PreviewSession,
  evaluator: ControlledEvaluator,
  value: PreviewSessionEvaluation,
  phase: 'runtime' | 'startup' = 'runtime',
): Promise<number> {
  const expectedCalls = evaluator.calls.length + 1;
  const pending = session.refresh(phase);
  await waitForCalls(evaluator, expectedCalls);
  evaluator.calls.at(-1)!.deferred.resolve(value);
  return pending;
}

describe('preview session source × catalog state tables', () => {
  const cleanModel = model('truth');
  const cases: Array<{
    readonly catalog: PreviewCatalogOutcome;
    readonly expectedCatalog: 'current' | 'not-requested' | 'unavailable';
    readonly expectedValidation: 'invalid' | 'unavailable' | 'valid';
    readonly name: string;
    readonly source: PreviewSourceOutcome;
  }> = [
    {
      catalog: { kind: 'not-requested' },
      expectedCatalog: 'not-requested',
      expectedValidation: 'valid',
      name: 'clean normalized source without a catalog',
      source: normalized(cleanModel),
    },
    {
      catalog: { kind: 'not-requested' },
      expectedCatalog: 'not-requested',
      expectedValidation: 'invalid',
      name: 'semantic-invalid normalized source without a catalog',
      source: normalized(cleanModel, [sourceDiagnostic]),
    },
    {
      catalog: { diagnostics: [], kind: 'current' },
      expectedCatalog: 'current',
      expectedValidation: 'valid',
      name: 'clean normalized source and exact current catalog',
      source: normalized(cleanModel),
    },
    {
      catalog: { diagnostics: [resourceDiagnostic], kind: 'current' },
      expectedCatalog: 'current',
      expectedValidation: 'invalid',
      name: 'resource-invalid current catalog',
      source: normalized(cleanModel),
    },
    {
      catalog: { kind: 'unavailable', notices: [catalogNotice] },
      expectedCatalog: 'unavailable',
      expectedValidation: 'unavailable',
      name: 'otherwise-clean source and unavailable requested catalog',
      source: normalized(cleanModel),
    },
    {
      catalog: { diagnostics: [], kind: 'current' },
      expectedCatalog: 'current',
      expectedValidation: 'invalid',
      name: 'semantic-invalid normalized source and current catalog',
      source: normalized(cleanModel, [sourceDiagnostic]),
    },
    {
      catalog: { diagnostics: [resourceDiagnostic], kind: 'current' },
      expectedCatalog: 'current',
      expectedValidation: 'invalid',
      name: 'source diagnostics precede current resource diagnostics',
      source: normalized(cleanModel, [sourceDiagnostic]),
    },
    {
      catalog: { kind: 'unavailable', notices: [catalogNotice] },
      expectedCatalog: 'unavailable',
      expectedValidation: 'invalid',
      name: 'source diagnostics take precedence over unavailable catalog',
      source: normalized(cleanModel, [sourceDiagnostic]),
    },
    {
      catalog: { kind: 'not-requested' },
      expectedCatalog: 'not-requested',
      expectedValidation: 'invalid',
      name: 'non-normalizable source without a catalog',
      source: notNormalizable(),
    },
    {
      catalog: { diagnostics: [], kind: 'current' },
      expectedCatalog: 'current',
      expectedValidation: 'invalid',
      name: 'non-normalizable source and current catalog',
      source: notNormalizable(),
    },
    {
      catalog: { kind: 'unavailable', notices: [catalogNotice] },
      expectedCatalog: 'unavailable',
      expectedValidation: 'invalid',
      name: 'non-normalizable source and unavailable catalog',
      source: notNormalizable(),
    },
  ];

  for (const testCase of cases) {
    it(testCase.name, async () => {
      const evaluator = new ControlledEvaluator();
      const session = new PreviewSession(evaluator, {
        catalogRequested: testCase.catalog.kind !== 'not-requested',
      });
      await publish(session, evaluator, evaluation('pair', testCase.source, testCase.catalog));
      const snapshot = session.getSnapshot();

      expect(snapshot.currentInput).toEqual({
        catalogState: testCase.expectedCatalog,
        sourceState: testCase.source.kind === 'normalized' ? 'normalized' : 'not-normalizable',
        validationState: testCase.expectedValidation,
      });
      expect(snapshot.model === null).toBe(testCase.source.kind === 'not-normalizable');
      expect(snapshot.diagnostics).toEqual([
        ...testCase.source.diagnostics,
        ...(testCase.catalog.kind === 'current' ? testCase.catalog.diagnostics : []),
      ]);
      if (testCase.source.kind === 'normalized') {
        expect(snapshot.retainedModel).toMatchObject({
          sourceRevision: 1,
          state: 'current',
          wasSemanticallyValid: testCase.source.diagnostics.length === 0,
        });
      } else {
        expect(snapshot.retainedModel).toBeNull();
      }
      session.close();
    });
  }

  it('reports graph partiality independently from semantic validity', async () => {
    const evaluator = new ControlledEvaluator();
    const session = new PreviewSession(evaluator);
    await publish(
      session,
      evaluator,
      evaluation('partial', normalized(model('partial', 'partial'), [sourceDiagnostic]), {
        kind: 'not-requested',
      }),
    );

    expect(session.getSnapshot().retainedModel).toEqual({
      graphPartial: true,
      sourceRevision: 1,
      state: 'current',
      wasSemanticallyValid: false,
    });
    session.close();
  });
});

describe('preview session retention and catalog recovery', () => {
  it('publishes semantic-invalid normalized models, retains exact model/provenance when stale, then replaces both on recovery', async () => {
    const evaluator = new ControlledEvaluator();
    const session = new PreviewSession(evaluator);
    const firstModel = model('first', 'partial');
    const firstProvenance = provenance(20);
    await publish(
      session,
      evaluator,
      evaluation('first', normalized(firstModel, [sourceDiagnostic], firstProvenance), {
        kind: 'not-requested',
      }),
      'startup',
    );

    expect(evaluator.calls[0].request).toEqual({
      catalogRequested: false,
      phase: 'startup',
      revision: 1,
    });
    expect(session.getSnapshot()).toMatchObject({
      diagnostics: [sourceDiagnostic],
      model: firstModel,
      retainedModel: {
        graphPartial: true,
        sourceRevision: 1,
        state: 'current',
        wasSemanticallyValid: false,
      },
    });

    const currentSyntaxDiagnostic = diagnostic('SPEC_YAML', 200);
    await publish(
      session,
      evaluator,
      evaluation('broken', notNormalizable([currentSyntaxDiagnostic]), {
        kind: 'not-requested',
      }),
    );
    const stale = session.getSnapshot();
    expect(stale.model).toEqual(firstModel);
    expect(stale.provenanceByInstanceId).toEqual(firstProvenance);
    expect(stale.diagnostics).toEqual([currentSyntaxDiagnostic]);
    expect(stale.retainedModel).toEqual({
      graphPartial: true,
      sourceRevision: 1,
      state: 'stale',
      wasSemanticallyValid: false,
    });
    expect(stale.modelNotices).toEqual([modelNotice]);
    expect(stale.sessionNotices.map(({ code }) => code)).toEqual([
      'PREVIEW_LAST_NORMALIZED_SNAPSHOT',
    ]);

    const recoveredModel = model('recovered');
    const recoveredProvenance = provenance(300);
    await publish(
      session,
      evaluator,
      evaluation('recovered', normalized(recoveredModel, [], recoveredProvenance), {
        kind: 'not-requested',
      }),
    );
    const recovered = session.getSnapshot();
    expect(recovered.model).toEqual(recoveredModel);
    expect(recovered.provenanceByInstanceId).toEqual(recoveredProvenance);
    expect(recovered.retainedModel).toMatchObject({ sourceRevision: 3, state: 'current' });
    expect(recovered.sessionNotices).toEqual([]);
    session.close();
  });

  it('never reuses old catalog diagnostics and publishes source changes while unavailable before current recovery', async () => {
    const evaluator = new ControlledEvaluator();
    const session = new PreviewSession(evaluator, { catalogRequested: true });
    await publish(
      session,
      evaluator,
      evaluation('catalog-current', normalized(model('one')), {
        diagnostics: [resourceDiagnostic],
        kind: 'current',
      }),
    );
    expect(session.getSnapshot().diagnostics).toEqual([resourceDiagnostic]);

    await publish(
      session,
      evaluator,
      evaluation('catalog-down-source-two', normalized(model('two')), {
        kind: 'unavailable',
        notices: [catalogNotice],
      }),
    );
    const unavailable = session.getSnapshot();
    expect(unavailable.currentInput).toMatchObject({
      catalogState: 'unavailable',
      validationState: 'unavailable',
    });
    expect(unavailable.diagnostics).toEqual([]);
    expect(unavailable.model!.chapters[0].key).toBe('two');
    expect(unavailable.sessionNotices).toEqual([catalogNotice]);

    await publish(
      session,
      evaluator,
      evaluation('catalog-down-source-three', normalized(model('three')), {
        kind: 'unavailable',
        notices: [catalogNotice],
      }),
    );
    expect(session.getSnapshot().model!.chapters[0].key).toBe('three');

    await publish(
      session,
      evaluator,
      evaluation('catalog-recovered-source-three', normalized(model('three')), {
        diagnostics: [],
        kind: 'current',
      }),
    );
    expect(session.getSnapshot()).toMatchObject({
      currentInput: { catalogState: 'current', validationState: 'valid' },
      generation: 4,
      sessionNotices: [],
    });
    session.close();
  });
});

describe('preview session coherent revision drain', () => {
  it('suppresses a slow superseded result and converges directly to the newest coherent pair', async () => {
    const evaluator = new ControlledEvaluator();
    const session = new PreviewSession(evaluator);
    const events: number[] = [];
    session.subscribe(({ generation }) => events.push(generation));

    const oldRefresh = session.refresh('startup');
    await waitForCalls(evaluator, 1);
    const newestRefresh = session.refresh();
    expect(session.requestedRevision).toBe(2);
    evaluator.calls[0].deferred.resolve(
      evaluation('old-pair', normalized(model('old')), { kind: 'not-requested' }),
    );
    await waitForCalls(evaluator, 2);

    expect(evaluator.calls[1].request.revision).toBe(2);
    expect(session.generation).toBe(0);
    expect(events).toEqual([]);
    evaluator.calls[1].deferred.resolve(
      evaluation('new-pair', normalized(model('new')), { kind: 'not-requested' }),
    );
    await expect(Promise.all([oldRefresh, newestRefresh])).resolves.toEqual([1, 1]);

    expect(session.getSnapshot().model!.chapters[0].key).toBe('new');
    expect(events).toEqual([1]);
    session.close();
  });

  it('coalesces request bursts to the latest revision and skips byte/status-identical pairs', async () => {
    const evaluator = new ControlledEvaluator();
    const session = new PreviewSession(evaluator);
    const first = session.refresh();
    await waitForCalls(evaluator, 1);
    const second = session.refresh();
    const third = session.refresh();
    const fourth = session.refresh();
    evaluator.calls[0].deferred.resolve(
      evaluation('superseded', normalized(model('superseded')), { kind: 'not-requested' }),
    );
    await waitForCalls(evaluator, 2);
    expect(evaluator.calls.map(({ request }) => request.revision)).toEqual([1, 4]);
    evaluator.calls[1].deferred.resolve(
      evaluation('stable-pair', normalized(model('latest')), { kind: 'not-requested' }),
    );
    await expect(Promise.all([first, second, third, fourth])).resolves.toEqual([1, 1, 1, 1]);

    await publish(
      session,
      evaluator,
      evaluation('stable-pair', normalized(model('ignored-equal-identity')), {
        kind: 'not-requested',
      }),
    );
    expect(session.generation).toBe(1);
    expect(session.getSnapshot().model!.chapters[0].key).toBe('latest');
    session.close();
  });
});

describe('preview session ownership and lifecycle', () => {
  it('returns independently cloned, deeply immutable snapshots and event objects', async () => {
    const evaluator = new ControlledEvaluator();
    const session = new PreviewSession(evaluator);
    const events: object[] = [];
    session.subscribe((event) => events.push(event));
    await publish(
      session,
      evaluator,
      evaluation('immutable', normalized(model('immutable')), { kind: 'not-requested' }),
    );

    const first = session.getSnapshot();
    const second = session.getSnapshot();
    expect(first).not.toBe(second);
    expect(first.model).not.toBe(second.model);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.model!.chapters[0].quests)).toBe(true);
    expect(Object.isFrozen(events[0])).toBe(true);
    expect(() => {
      (first.model!.chapters as unknown as PreviewModelV1['chapters'][number][]).push(
        first.model!.chapters[0],
      );
    }).toThrow();
    expect(session.getSnapshot().model!.chapters).toHaveLength(1);
    session.close();
  });

  it('supports idempotent unsubscribe and prevents notifications after close, including late results', async () => {
    const evaluator = new ControlledEvaluator();
    const session = new PreviewSession(evaluator);
    const firstEvents: number[] = [];
    const secondEvents: number[] = [];
    const unsubscribe = session.subscribe(({ generation }) => firstEvents.push(generation));
    session.subscribe(({ generation }) => secondEvents.push(generation));

    await publish(
      session,
      evaluator,
      evaluation('first', normalized(model('first')), { kind: 'not-requested' }),
    );
    unsubscribe();
    unsubscribe();
    await publish(
      session,
      evaluator,
      evaluation('second', normalized(model('second')), { kind: 'not-requested' }),
    );
    expect(firstEvents).toEqual([1]);
    expect(secondEvents).toEqual([1, 2]);

    const pending = session.refresh();
    await waitForCalls(evaluator, 3);
    session.close();
    session.close();
    await expect(pending).rejects.toThrow('closed');
    evaluator.calls[2].deferred.resolve(
      evaluation('late', normalized(model('late')), { kind: 'not-requested' }),
    );
    await Promise.resolve();
    expect(secondEvents).toEqual([1, 2]);
    expect(session.generation).toBe(2);
    await expect(session.refresh()).rejects.toThrow('closed');
  });

  it('propagates evaluator startup failure without publication and can retry at runtime', async () => {
    const evaluator = new ControlledEvaluator();
    const session = new PreviewSession(evaluator, { catalogRequested: true });
    const startup = session.refresh('startup');
    await waitForCalls(evaluator, 1);
    evaluator.calls[0].deferred.reject(new Error('startup input status failure'));
    await expect(startup).rejects.toThrow('startup input status failure');
    expect(session.generation).toBe(0);

    await publish(
      session,
      evaluator,
      evaluation('runtime-recovery', normalized(model('recovery')), {
        diagnostics: [],
        kind: 'current',
      }),
    );
    expect(evaluator.calls[1].request).toMatchObject({ phase: 'runtime', revision: 2 });
    expect(session.getSnapshot().generation).toBe(1);
    session.close();
  });
});

import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import type { PreviewDiagnostic, PreviewNotice } from '@questspec/preview-contract';
import {
  type Questbook,
  ResourceCatalogError,
  type YamlSourceMap,
  loadQuestbook,
  parseResourceCatalog,
  validateQuestbookResources,
} from '@questspec/core';
import type {
  PreviewCatalogOutcome,
  PreviewEvaluationRequest,
  PreviewSessionEvaluation,
  PreviewSessionEvaluator,
  PreviewSourceOutcome,
} from './session.ts';
import { sanitizeDiagnosticText, sanitizePreviewDiagnostics } from './diagnostics.ts';
import {
  type CapturePreviewInputOptions,
  type CapturedPreviewInput,
  PreviewInputError,
  capturePreviewInput,
} from './input.ts';
import { projectPreviewModel } from './model.ts';
import { projectPreviewProvenance } from './provenance.ts';

export interface PreviewLoaderOptions {
  readonly catalogPath?: string;
  readonly capture?: CapturePreviewInputOptions;
  readonly sourcePath: string;
}

interface EvaluatedSource {
  readonly outcome: PreviewSourceOutcome;
  readonly questbook?: Questbook;
  readonly sourceMap?: YamlSourceMap;
}

export class PreviewLoader implements PreviewSessionEvaluator {
  readonly #catalogPath: string | undefined;
  readonly #capture: CapturePreviewInputOptions;
  readonly #sourcePath: string;

  constructor(options: PreviewLoaderOptions) {
    this.#sourcePath = options.sourcePath;
    this.#catalogPath = options.catalogPath;
    this.#capture = options.capture ?? {};
  }

  async evaluate(request: PreviewEvaluationRequest): Promise<PreviewSessionEvaluation> {
    const [sourceResult, catalogResult] = await Promise.allSettled([
      capturePreviewInput(this.#sourcePath, 'source', this.#capture),
      this.#catalogPath === undefined
        ? Promise.resolve(undefined)
        : capturePreviewInput(this.#catalogPath, 'catalog', this.#capture),
    ]);

    if (request.phase === 'startup') {
      if (sourceResult.status === 'rejected') {
        throw sourceResult.reason;
      }
      if (catalogResult.status === 'rejected') {
        throw catalogResult.reason;
      }
    }

    const evaluatedSource =
      sourceResult.status === 'fulfilled'
        ? evaluateSource(sourceResult.value, this.#sourcePath)
        : {
            outcome: unavailableSource(
              normalizeInputFailure(sourceResult.reason, 'source'),
              this.#sourcePath,
            ),
          };
    const catalog = evaluateCatalog(
      catalogResult,
      evaluatedSource,
      this.#catalogPath,
      this.#sourcePath,
    );

    return {
      catalog,
      inputIdentity: evaluationIdentity(sourceResult, catalogResult),
      source: evaluatedSource.outcome,
    };
  }
}

function evaluateSource(captured: CapturedPreviewInput, sourcePath: string): EvaluatedSource {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(captured.bytes);
  } catch {
    return {
      outcome: {
        diagnostics: [
          operationalDiagnostic(
            'PREVIEW_SOURCE_ENCODING_INVALID',
            'The source is not valid UTF-8',
            sourcePath,
          ),
        ],
        kind: 'not-normalizable',
      },
    };
  }
  const loaded = loadQuestbook(text, sourcePath);
  const diagnostics = sanitizePreviewDiagnostics(loaded.diagnostics, basename(sourcePath));
  if (loaded.value === undefined) {
    return { outcome: { diagnostics, kind: 'not-normalizable' } };
  }
  const projected = projectPreviewModel(loaded.value, loaded.graphState);
  return {
    outcome: {
      diagnostics,
      kind: 'normalized',
      model: projected.model,
      modelNotices: projected.notices,
      provenanceByInstanceId: projectPreviewProvenance(loaded.value, loaded.sourceMap),
      semanticallyValid: diagnostics.length === 0,
    },
    questbook: loaded.value,
    sourceMap: loaded.sourceMap,
  };
}

function unavailableSource(error: PreviewInputError, sourcePath: string): PreviewSourceOutcome {
  return {
    diagnostics: [operationalDiagnostic(error.code, error.message, sourcePath)],
    kind: 'not-normalizable',
  };
}

function evaluateCatalog(
  capturedResult: PromiseSettledResult<CapturedPreviewInput | undefined>,
  source: EvaluatedSource,
  catalogPath: string | undefined,
  sourcePath: string,
): PreviewCatalogOutcome {
  if (catalogPath === undefined) {
    return { kind: 'not-requested' };
  }
  if (capturedResult.status === 'rejected') {
    const error = normalizeInputFailure(capturedResult.reason, 'catalog');
    return { kind: 'unavailable', notices: [catalogNotice(error.code, error.message)] };
  }
  const captured = capturedResult.value;
  if (captured === undefined) {
    return {
      kind: 'unavailable',
      notices: [
        catalogNotice('PREVIEW_CATALOG_UNAVAILABLE', 'The resource catalog is unavailable'),
      ],
    };
  }

  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(captured.bytes);
  } catch {
    return {
      kind: 'unavailable',
      notices: [
        catalogNotice('PREVIEW_CATALOG_ENCODING_INVALID', 'The catalog is not valid UTF-8'),
      ],
    };
  }

  try {
    const catalog = parseResourceCatalog(text);
    if (source.questbook === undefined || source.sourceMap === undefined) {
      return { diagnostics: [], kind: 'current' };
    }
    const diagnostics = validateQuestbookResources(source.questbook, catalog).map((diagnostic) => ({
      ...diagnostic,
      file: sourcePath,
      span: source.sourceMap!.spanForPath(diagnostic.path),
    }));
    return {
      diagnostics: sanitizePreviewDiagnostics(diagnostics, basename(sourcePath)),
      kind: 'current',
    };
  } catch (error) {
    if (!(error instanceof ResourceCatalogError)) {
      throw error;
    }
    return {
      kind: 'unavailable',
      notices: [catalogNotice(error.code, sanitizeDiagnosticText(error.message, catalogPath))],
    };
  }
}

function operationalDiagnostic(code: string, message: string, file: string): PreviewDiagnostic {
  return Object.freeze({
    code,
    displayFile: basename(file),
    message: sanitizeDiagnosticText(message, file),
    path: Object.freeze([]),
    severity: 'error' as const,
  });
}

function catalogNotice(code: string, message: string): PreviewNotice {
  return Object.freeze({
    code,
    message: sanitizeDiagnosticText(message),
    path: Object.freeze([]),
    severity: 'warning' as const,
  });
}

function normalizeInputFailure(error: unknown, kind: 'catalog' | 'source'): PreviewInputError {
  return error instanceof PreviewInputError
    ? error
    : new PreviewInputError('INPUT_NOT_READABLE', kind, `The ${kind} is missing or unreadable`, {
        cause: error,
      });
}

function evaluationIdentity(
  source: PromiseSettledResult<CapturedPreviewInput>,
  catalog: PromiseSettledResult<CapturedPreviewInput | undefined>,
): string {
  const hash = createHash('sha256');
  hash.update('questspec-preview-evaluation-v1\0');
  hash.update(resultIdentity(source));
  hash.update('\0');
  hash.update(resultIdentity(catalog));
  return hash.digest('hex');
}

function resultIdentity(result: PromiseSettledResult<CapturedPreviewInput | undefined>): string {
  if (result.status === 'fulfilled') {
    return result.value === undefined ? 'not-requested' : result.value.identity;
  }
  const error = result.reason as unknown;
  return error instanceof PreviewInputError
    ? `unavailable:${error.kind}:${error.code}`
    : 'unavailable';
}

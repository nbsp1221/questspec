import type {
  PreviewLocalizedLines,
  PreviewLocalizedSelection,
  PreviewLocalizedText,
} from '@questspec/preview-contract';

export interface PreviewLocaleContext {
  readonly defaultLocale: string;
  readonly locales: readonly string[];
  readonly selectedLocale: string;
}

export function localizeText(
  value: PreviewLocalizedText,
  logicalKey: string,
  context: PreviewLocaleContext,
): PreviewLocalizedSelection<string> {
  assertDeclaredLocale(context);
  const selected = value[context.selectedLocale];
  if (selected !== undefined) {
    return selection(selected, context, 'selected', context.selectedLocale);
  }
  const fallback = value[context.defaultLocale];
  if (fallback !== undefined) {
    return selection(fallback, context, 'default', context.defaultLocale);
  }
  return selection(logicalKey, context, 'logical-key', null);
}

export function localizeLines(
  value: PreviewLocalizedLines,
  logicalKey: string,
  context: PreviewLocaleContext,
): PreviewLocalizedSelection<readonly string[]> {
  assertDeclaredLocale(context);
  const selected = value[context.selectedLocale];
  if (selected !== undefined) {
    return selection([...selected], context, 'selected', context.selectedLocale);
  }
  const fallback = value[context.defaultLocale];
  if (fallback !== undefined) {
    return selection([...fallback], context, 'default', context.defaultLocale);
  }
  return selection([logicalKey], context, 'logical-key', null);
}

function assertDeclaredLocale(context: PreviewLocaleContext): void {
  if (!context.locales.includes(context.selectedLocale)) {
    throw new RangeError(`Preview locale is not declared: ${context.selectedLocale}`);
  }
}

function selection<T>(
  value: T,
  context: PreviewLocaleContext,
  source: 'default' | 'logical-key' | 'selected',
  usedLocale: string | null,
): PreviewLocalizedSelection<T> {
  return Object.freeze({
    fallback: source !== 'selected',
    requestedLocale: context.selectedLocale,
    source,
    usedLocale,
    value,
  });
}

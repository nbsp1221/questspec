import type {
  PreviewLocalizedLines,
  PreviewLocalizedSelection,
  PreviewLocalizedText,
} from '@questspec/preview-contract';

function select<T>(
  values: Readonly<Record<string, T>>,
  selectedLocale: string,
  defaultLocale: string,
  logicalFallback: T,
): PreviewLocalizedSelection<T> {
  if (values[selectedLocale] !== undefined) {
    return {
      fallback: false,
      requestedLocale: selectedLocale,
      source: 'selected',
      usedLocale: selectedLocale,
      value: values[selectedLocale],
    };
  }
  if (values[defaultLocale] !== undefined) {
    return {
      fallback: true,
      requestedLocale: selectedLocale,
      source: 'default',
      usedLocale: defaultLocale,
      value: values[defaultLocale],
    };
  }
  return {
    fallback: true,
    requestedLocale: selectedLocale,
    source: 'logical-key',
    usedLocale: null,
    value: logicalFallback,
  };
}

export function localizeText(
  values: PreviewLocalizedText,
  selectedLocale: string,
  defaultLocale: string,
  logicalKey: string,
): PreviewLocalizedSelection<string> {
  return select(values, selectedLocale, defaultLocale, logicalKey);
}

export function localizeLines(
  values: PreviewLocalizedLines,
  selectedLocale: string,
  defaultLocale: string,
  logicalKey: string,
): PreviewLocalizedSelection<readonly string[]> {
  return select(values, selectedLocale, defaultLocale, [logicalKey]);
}

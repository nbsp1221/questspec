export function previewDocumentLanguage(locale: string): string {
  const normalized = locale.trim().replaceAll('_', '-');
  if (normalized.toLocaleLowerCase() === 'source') {
    return 'en';
  }
  try {
    const language = new Intl.Locale(normalized);
    return language.language === 'und' ? 'en' : language.toString();
  } catch {
    return 'en';
  }
}

export function previewLocaleLabel(locale: string): string {
  if (locale.trim().toLocaleLowerCase() === 'source') {
    return 'Source text';
  }
  const languageTag = previewDocumentLanguage(locale);
  try {
    const parsed = new Intl.Locale(languageTag);
    const names = new Intl.DisplayNames([languageTag, 'en'], { type: 'language' });
    const languageName = names.of(parsed.language) ?? parsed.language.toUpperCase();
    const region = parsed.region === undefined ? '' : ` (${parsed.region})`;
    return `${languageName}${region}`;
  } catch {
    return locale.replaceAll('_', '-').toUpperCase();
  }
}

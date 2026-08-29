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

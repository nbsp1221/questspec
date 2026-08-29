import type { QuestPreview } from './model.ts';
import { previewDocumentLanguage } from './locale.ts';

export function renderPreviewPage(preview: QuestPreview): string {
  const language = previewDocumentLanguage(preview.selectedLocale);
  return `<!doctype html>
<html lang="${language || 'en'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="dark">
<title>QuestSpec Preview</title>
<link rel="stylesheet" href="/assets/app.css">
<script src="/assets/app.js" defer></script>
</head>
<body>
<div id="questspec-root"><p class="boot-status">Opening quest fieldbook…</p></div>
<noscript>QuestSpec Preview requires JavaScript to render the read-only quest graph.</noscript>
</body>
</html>`;
}

import { PREVIEW_SCHEMA_VERSION } from '@questspec/preview-contract';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

function PreviewShell() {
  return (
    <main>
      <h1>QuestSpec Preview</h1>
      <p>Preview contract v{PREVIEW_SCHEMA_VERSION} workspace shell</p>
    </main>
  );
}

const root = document.querySelector('#root');
if (!(root instanceof HTMLElement)) {
  throw new Error('Preview root element is missing.');
}

createRoot(root).render(
  <StrictMode>
    <PreviewShell />
  </StrictMode>,
);

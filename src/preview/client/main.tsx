import '@xyflow/react/dist/style.css';
import './styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { QuestPreview } from '../types.ts';
import { PreviewApp } from './App.tsx';

const root = document.querySelector<HTMLElement>('#questspec-root');
if (root === null) {
  throw new Error('QuestSpec preview root is missing');
}

void start(root);

async function start(container: HTMLElement): Promise<void> {
  try {
    const response = await fetch('/preview.json', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Preview data request failed with ${response.status}`);
    }
    const preview = (await response.json()) as QuestPreview;
    createRoot(container).render(
      <StrictMode>
        <PreviewApp preview={preview} />
      </StrictMode>,
    );
  } catch (error) {
    container.replaceChildren();
    const message = document.createElement('p');
    message.className = 'boot-error';
    message.textContent =
      error instanceof Error ? error.message : 'QuestSpec preview could not start.';
    container.append(message);
  }
}

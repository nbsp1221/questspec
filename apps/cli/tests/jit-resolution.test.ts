import { loadQuestbook } from '@questspec/core';
import { PREVIEW_SCHEMA_VERSION } from '@questspec/preview-contract';
import { expect, it } from 'vitest';

it('resolves both JIT workspace packages through exports', () => {
  expect(typeof loadQuestbook).toBe('function');
  expect(PREVIEW_SCHEMA_VERSION).toBe(1);
});

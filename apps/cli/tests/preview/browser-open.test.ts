import { describe, expect, it, vi } from 'vitest';
import { openPreviewBrowser } from '../../src/preview/browser-open.ts';

describe('preview browser opener', () => {
  it('passes the bound URL as exactly one value to the injected opener', async () => {
    const opener = vi.fn((_url: string) => Promise.resolve());
    await openPreviewBrowser('http://127.0.0.1:4173', opener);
    expect(opener).toHaveBeenCalledOnce();
    expect(opener).toHaveBeenCalledWith('http://127.0.0.1:4173');
  });

  it('rejects non-loopback values and leaves launch failure handling to the CLI boundary', async () => {
    await expect(openPreviewBrowser('http://localhost:4173', vi.fn())).rejects.toThrow(/loopback/u);
    await expect(
      openPreviewBrowser('http://127.0.0.1:4173', () =>
        Promise.reject(new Error('launcher failed')),
      ),
    ).rejects.toThrow('launcher failed');
  });
});

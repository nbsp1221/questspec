import open from 'open';

export type BrowserOpenFunction = (url: string) => Promise<unknown>;

export async function openPreviewBrowser(
  url: string,
  openFunction: BrowserOpenFunction = open,
): Promise<void> {
  if (!/^http:\/\/127\.0\.0\.1:\d+$/u.test(url)) {
    throw new TypeError('Preview browser URL must be a bound IPv4 loopback URL');
  }
  await openFunction(url);
}

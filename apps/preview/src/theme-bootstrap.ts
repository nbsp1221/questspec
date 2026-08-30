/*
 * First-paint theme bootstrap.
 *
 * The page loads this as a small blocking script in <head>, so the document is
 * claimed for the resolved theme before the body is parsed and painted. Without
 * it a stored light choice would flash the default dark GUI while the deferred
 * application bundle downloads. It stays a separate entry point because the
 * application bundle is far too large to block first paint on.
 */

import { applyPreviewTheme, resolvePreviewTheme } from './theme.ts';

applyPreviewTheme(resolvePreviewTheme());

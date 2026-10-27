// Build-time helpers for the service worker (used by vite.config.ts).

import { createHash } from 'node:crypto';

/**
 * The URLs to cache, relative to the app's scope, from the files in dist/.
 * Pages are cached under their folder URL (fight/), which is what players open.
 */
export function precacheUrls(files: string[]): string[] {
  return files
    .filter((f) => f !== 'sw.js' && !f.split('/').some((part) => part.startsWith('.')))
    .map((f) => (f === 'index.html' ? './' : f.replace(/(^|\/)index\.html$/, '$1')))
    .sort();
}

/** Changes whenever any built file changes, so each deploy installs a new worker. */
export function buildVersion(files: { path: string; content: Uint8Array }[]): string {
  const hash = createHash('sha256');
  for (const f of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    hash.update(f.path).update('\0').update(f.content).update('\0');
  }
  return hash.digest('hex').slice(0, 12);
}

/** The worker script: the version and file list, then the worker's own code. */
export function workerScript(version: string, urls: string[], body: string): string {
  return `const VERSION = ${JSON.stringify(version)};\nconst PRECACHE = ${JSON.stringify(urls)};\n${body}`;
}

// Small helpers shared by every page.

import { storageWarning } from './store';

export function esc(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

export function topbar(where: string): string {
  const warning = storageWarning();
  return `
    <header class="topbar">
      <a href="${import.meta.env.BASE_URL}">AWAKEN</a>
      <span class="where">${esc(where)}</span>
      <span class="spacer"></span>
      <span class="wire-tag">Wireframe</span>
    </header>
    ${warning ? `<p class="storage-warning" role="alert">${esc(warning)}</p>` : ''}`;
}

export const DISCLAIMER = `
  <footer class="disclaimer">
    Unofficial fan-made tool. Not affiliated with or endorsed by the publisher of <em>Primal: The Awakening</em>.
  </footer>`;

/** Keep the screen on while a page is in use, where the browser allows it. */
export function keepAwake(): void {
  const request = async () => {
    try {
      await (navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<unknown> } })
        .wakeLock?.request('screen');
    } catch {
      // Not supported or refused; nothing to do.
    }
  };
  document.addEventListener('click', request, { once: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void request();
  });
}

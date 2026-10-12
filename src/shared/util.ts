// Small helpers shared by every page.

export function esc(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

/**
 * Wireframe storage: localStorage with try/catch. The real app moves to
 * IndexedDB with versioned records (see design/ux-plan.md, Data safety).
 */
export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or storage full: the page still works for this visit.
  }
}

export const KEYS = {
  fight: 'awaken.wire.fight.v1',
  hunters: 'awaken.wire.hunters.v1',
  campaign: 'awaken.wire.campaign.v1',
  role: 'awaken.wire.role.v1',
} as const;

export function topbar(where: string): string {
  return `
    <header class="topbar">
      <a href="${import.meta.env.BASE_URL}">AWAKEN</a>
      <span class="where">${esc(where)}</span>
      <span class="spacer"></span>
      <span class="wire-tag">Wireframe</span>
    </header>`;
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

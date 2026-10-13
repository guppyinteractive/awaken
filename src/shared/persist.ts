// Ask the browser to keep saved data permanently, so it isn't cleared to free
// up space (design/ux-plan.md, Data safety, risk 6).

export type Protection = 'protected' | 'unprotected' | 'unsupported';

/** The parts of navigator used here; storage is missing in older browsers. */
type Nav = { storage?: StorageManager; standalone?: boolean };

export async function protection(nav: Nav = navigator): Promise<Protection> {
  if (!nav.storage?.persisted) return 'unsupported';
  try {
    return (await nav.storage.persisted()) ? 'protected' : 'unprotected';
  } catch {
    return 'unsupported';
  }
}

/** Ask for permanent storage. Firefox shows a prompt, so call this from a tap. */
export async function protect(nav: Nav = navigator): Promise<Protection> {
  if (!nav.storage?.persist) return 'unsupported';
  try {
    return (await nav.storage.persist()) ? 'protected' : 'unprotected';
  } catch {
    return 'unsupported';
  }
}

/** Opened from the home screen rather than a browser tab. */
export function isInstalled(nav: Nav = navigator): boolean {
  return nav.standalone === true || globalThis.matchMedia?.('(display-mode: standalone)').matches === true;
}

/**
 * Browsers mostly grant permanent storage to installed apps, without a
 * prompt, so an installed app asks every time it starts until it's granted.
 */
export async function protectIfInstalled(nav: Nav = navigator): Promise<Protection> {
  const now = await protection(nav);
  return now === 'unprotected' && isInstalled(nav) ? protect(nav) : now;
}

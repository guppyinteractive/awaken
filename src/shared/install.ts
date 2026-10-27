// Installing the app to the home screen, and the service worker that lets it
// work offline (design/ux-plan.md, Installable app and Data safety).

import { isInstalled } from './persist';

/** Chrome's install prompt; not in the DOM types yet. */
interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** How this browser installs the app: its own prompt, the Share sheet (iPhone and iPad), or its menu. */
export type InstallWay = 'installed' | 'prompt' | 'share' | 'menu';

let deferred: InstallPrompt | null = null;
let justInstalled = false;
const listeners: (() => void)[] = [];
const changed = () => listeners.forEach((f) => f());

// Listen as soon as the module loads: Chrome can offer the prompt before the page has rendered.
globalThis.addEventListener?.('beforeinstallprompt', (ev) => {
  ev.preventDefault(); // show our button instead of the browser's mini-bar
  deferred = ev as InstallPrompt;
  changed();
});
globalThis.addEventListener?.('appinstalled', () => {
  deferred = null;
  justInstalled = true;
  changed();
});

/** Call when the install prompt becomes available or the app gets installed. */
export function onInstallChange(f: () => void): void {
  listeners.push(f);
}

type Env = { standalone?: boolean; userAgent: string; platform?: string; maxTouchPoints?: number };

/** iPhone and iPad (iPadOS says it's a Mac, but a Mac has no touch screen). */
export function isApple(env: Env): boolean {
  return /iPhone|iPad|iPod/.test(env.userAgent) || (env.platform === 'MacIntel' && (env.maxTouchPoints ?? 0) > 1);
}

export function installWay(env: Env = navigator, prompt = deferred !== null): InstallWay {
  if (justInstalled || isInstalled(env)) return 'installed';
  if (prompt) return 'prompt';
  return isApple(env) ? 'share' : 'menu';
}

/** Show the browser's install prompt. Resolves to whether the player installed. */
export async function promptInstall(): Promise<boolean> {
  const ev = deferred;
  if (!ev) return false;
  deferred = null; // each prompt can be shown once
  await ev.prompt();
  const { outcome } = await ev.userChoice;
  changed();
  return outcome === 'accepted';
}

/** Start the service worker, so the app works offline and can be installed. */
export function registerWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const base = import.meta.env.BASE_URL;
  navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch(() => {
    // Not allowed here (private mode, some in-app browsers); the app still works online.
  });
}

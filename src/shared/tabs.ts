// One active tab (design/ux-plan.md, Data safety, risk 10). Each page keeps
// its saved data in memory and writes it back whole, so two open tabs would
// overwrite each other. Only the tab holding this lock saves; any other tab
// stops saving and shows a notice with a Use here button.

import { pauseSaving } from './store';

const LOCK = 'awaken-active-tab';

/** The parts of navigator.locks used here; missing in older browsers. */
type Locks = { request(name: string, options: LockOptions, callback: (lock: Lock | null) => unknown): Promise<unknown> };

export interface Guard {
  /** This tab may save. */
  active(): boolean;
  /** Take over from the other tab. */
  take(): Promise<void>;
  /** Let go while the page is hidden in the back/forward cache. */
  suspend(): void;
  /** Claim it again when the page comes back from the cache. */
  resume(): Promise<void>;
}

/**
 * Hold the lock while this tab is active. `inactive` runs when another tab
 * has it, either at start or after it took over; `freed` runs when the tab
 * that had it closes. Without Web Locks every tab stays active.
 */
export async function createGuard(
  locks: Locks | undefined,
  inactive: () => void,
  freed: () => void,
): Promise<Guard> {
  let active = !locks;
  let release: (() => void) | null = null;

  /** Resolves with whether the lock was granted. */
  const hold = (options: LockOptions) => new Promise<boolean>((granted) => {
    locks!.request(LOCK, options, (lock) => {
      if (!lock) return granted(false); // ifAvailable, and another tab has it
      active = true;
      granted(true);
      return new Promise<void>((r) => { release = r; });
    }).catch((e: Error) => {
      // Another tab stole the lock. Any other failure: stay as we are.
      if (e.name !== 'AbortError' || !active) return;
      active = false;
      release = null;
      inactive();
      waitInLine();
    });
  });

  /** Closing the tab that has the lock frees this one. */
  let waiting = false;
  const waitInLine = () => {
    if (waiting) return;
    waiting = true;
    void hold({}).then((granted) => granted && freed());
  };

  async function claim(): Promise<void> {
    if (!(await hold({ ifAvailable: true }))) {
      inactive();
      waitInLine();
    }
  }

  if (locks) await claim();

  return {
    active: () => active,
    async take() {
      if (!locks || active) return;
      await hold({ steal: true });
    },
    suspend() {
      if (!locks || !active) return;
      active = false;
      release?.();
      release = null;
    },
    async resume() {
      if (locks && !active && !waiting) await claim();
    },
  };
}

function showNotice(): void {
  if (document.querySelector('.other-tab')) return;
  const notice = document.createElement('div');
  notice.className = 'other-tab';
  notice.setAttribute('role', 'alertdialog');
  notice.setAttribute('aria-modal', 'true');
  notice.setAttribute('aria-labelledby', 'other-tab-title');
  notice.innerHTML = `
    <div class="box">
      <div class="mid" id="other-tab-title">Open in another tab</div>
      <p>Awaken is open in another tab or window. Only one can save at a time, so changes here are not saved.</p>
      <div class="row">
        <button class="btn primary" data-act="use-here">Use here</button>
        <span class="note">The other tab will stop saving.</span>
      </div>
    </div>`;
  document.getElementById('app')?.setAttribute('inert', ''); // nothing behind it can be used
  document.body.append(notice);
  notice.querySelector<HTMLElement>('[data-act="use-here"]')!.focus();
}

/**
 * Start the guard for this page. Call it before the page loads its data.
 * Taking over, or the other tab closing, reloads this page so it shows the
 * latest saved progress.
 */
export async function oneTab(locks: Locks | undefined = navigator.locks): Promise<void> {
  const guard = await createGuard(
    locks,
    () => {
      pauseSaving();
      showNotice();
    },
    () => location.reload(),
  );

  addEventListener('pagehide', (ev) => { if (ev.persisted) guard.suspend(); });
  addEventListener('pageshow', (ev) => { if (ev.persisted) void guard.resume(); });

  document.addEventListener('click', async (ev) => {
    if (!(ev.target as Element).closest('[data-act="use-here"]')) return;
    await guard.take();
    location.reload();
  });
}

import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { createGuard } from './tabs';
import { createStore } from './store';

/** One browser's navigator.locks, shared by its tabs: exclusive locks with ifAvailable, steal and a queue. */
class FakeLocks {
  private holder: { release: () => void; abort: (e: Error) => void } | null = null;
  private queue: (() => void)[] = [];

  request(_name: string, options: LockOptions, callback: (lock: Lock | null) => any): Promise<any> {
    return new Promise((resolve, reject) => {
      const grant = () => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          if (this.holder === me) this.holder = null;
          this.queue.shift()?.();
        };
        const me = { release: finish, abort: (e: Error) => { done = true; reject(e); } };
        this.holder = me;
        Promise.resolve(callback({ name: 'x', mode: 'exclusive' } as Lock)).then((v) => { finish(); resolve(v); });
      };
      if (!this.holder) return grant();
      if (options.steal) {
        const old = this.holder;
        this.holder = null;
        old.abort(Object.assign(new Error('stolen'), { name: 'AbortError' }));
        return grant();
      }
      if (options.ifAvailable) return Promise.resolve(callback(null)).then(resolve);
      this.queue.push(grant);
    });
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0));

function tab(locks: FakeLocks) {
  const t = { inactive: 0, freed: 0 };
  return { t, guard: createGuard(locks, () => { t.inactive++; }, () => { t.freed++; }) };
}

describe('one active tab', () => {
  it('lets the first tab save and stops the second', async () => {
    const locks = new FakeLocks();
    const a = tab(locks), b = tab(locks);
    expect((await a.guard).active()).toBe(true);
    expect((await b.guard).active()).toBe(false);
    expect(a.t.inactive).toBe(0);
    expect(b.t.inactive).toBe(1);
  });

  it('Use here takes over, and the other tab stops', async () => {
    const locks = new FakeLocks();
    const a = tab(locks), b = tab(locks);
    const [ga, gb] = [await a.guard, await b.guard];
    await gb.take();
    await tick();
    expect(gb.active()).toBe(true);
    expect(ga.active()).toBe(false);
    expect(a.t.inactive).toBe(1);
  });

  it('frees a waiting tab when the active one lets go', async () => {
    const locks = new FakeLocks();
    const a = tab(locks), b = tab(locks);
    const ga = await a.guard;
    await b.guard;
    ga.suspend(); // like leaving the page
    await tick();
    expect(b.t.freed).toBe(1);
  });

  it('claims the lock again coming back from the back/forward cache, if it is free', async () => {
    const locks = new FakeLocks();
    const ga = await tab(locks).guard;
    ga.suspend();
    await tick();
    await ga.resume();
    expect(ga.active()).toBe(true);
  });

  it('keeps every tab active without Web Locks', async () => {
    const t = { n: 0 };
    const g = await createGuard(undefined, () => { t.n++; }, () => {});
    expect(g.active()).toBe(true);
    expect(t.n).toBe(0);
  });
});

describe('paused store', () => {
  it('stops saving and restoring', async () => {
    const idb = new IDBFactory();
    const s = createStore({ idb });
    await s.save('role', 'keeper');
    s.pause();
    await s.save('role', 'hunter');
    await expect(s.restore({ role: { version: 1, savedAt: '', data: 'hunter' } })).rejects.toThrow();
    expect(await createStore({ idb }).load('role', null)).toBe('keeper');
  });
});

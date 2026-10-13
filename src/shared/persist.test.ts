import { describe, expect, it } from 'vitest';
import { protect, protectIfInstalled, protection } from './persist';

/** A fake navigator whose browser grants permanent storage when `grants` is true. */
function fakeNav(opts: { persisted?: boolean; grants?: boolean; installed?: boolean; supported?: boolean }) {
  let persisted = opts.persisted ?? false;
  let asked = 0;
  const storage = opts.supported === false ? undefined : {
    persisted: async () => persisted,
    persist: async () => { asked++; persisted ||= opts.grants ?? false; return persisted; },
  } as unknown as StorageManager;
  return { nav: { storage, standalone: opts.installed ?? false }, asked: () => asked };
}

describe('persistent storage', () => {
  it('reports the current status', async () => {
    expect(await protection(fakeNav({ persisted: true }).nav)).toBe('protected');
    expect(await protection(fakeNav({}).nav)).toBe('unprotected');
    expect(await protection(fakeNav({ supported: false }).nav)).toBe('unsupported');
  });

  it('protect asks the browser and reports its answer', async () => {
    expect(await protect(fakeNav({ grants: true }).nav)).toBe('protected');
    expect(await protect(fakeNav({ grants: false }).nav)).toBe('unprotected');
    expect(await protect(fakeNav({ supported: false }).nav)).toBe('unsupported');
  });

  it('asks without a tap only when installed', async () => {
    const tab = fakeNav({ grants: true });
    expect(await protectIfInstalled(tab.nav)).toBe('unprotected');
    expect(tab.asked()).toBe(0);

    const app = fakeNav({ grants: true, installed: true });
    expect(await protectIfInstalled(app.nav)).toBe('protected');
    expect(app.asked()).toBe(1);
  });

  it('does not ask again once protected', async () => {
    const app = fakeNav({ persisted: true, installed: true });
    expect(await protectIfInstalled(app.nav)).toBe('protected');
    expect(app.asked()).toBe(0);
  });
});

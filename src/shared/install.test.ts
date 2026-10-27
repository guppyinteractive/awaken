import { describe, expect, it } from 'vitest';
import { installWay, isApple } from './install';
import { precacheUrls, buildVersion, workerScript } from '../sw/precache';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36';

describe('installing', () => {
  it('tells iPhones and iPads to use the Share sheet', () => {
    expect(isApple({ userAgent: IPHONE })).toBe(true);
    expect(isApple({ userAgent: MAC, platform: 'MacIntel', maxTouchPoints: 5 })).toBe(true); // iPad
    expect(isApple({ userAgent: MAC, platform: 'MacIntel', maxTouchPoints: 0 })).toBe(false);
    expect(installWay({ userAgent: IPHONE }, false)).toBe('share');
  });

  it("uses the browser's prompt when there is one, else its menu", () => {
    expect(installWay({ userAgent: ANDROID }, true)).toBe('prompt');
    expect(installWay({ userAgent: ANDROID }, false)).toBe('menu');
  });

  it('knows when it is already the installed app', () => {
    expect(installWay({ userAgent: IPHONE, standalone: true }, false)).toBe('installed');
  });
});

describe('service worker build', () => {
  it('caches every built file, with pages under their folder URL', () => {
    expect(precacheUrls(['index.html', 'fight/index.html', 'assets/fight-1a2b.js', 'sw.js', 'icon.svg', '.nojekyll']))
      .toEqual(['./', 'assets/fight-1a2b.js', 'fight/', 'icon.svg']);
  });

  it('gets a new version whenever a file changes', () => {
    const a = [{ path: 'index.html', content: new TextEncoder().encode('one') }];
    const b = [{ path: 'index.html', content: new TextEncoder().encode('two') }];
    expect(buildVersion(a)).toBe(buildVersion([...a]));
    expect(buildVersion(a)).not.toBe(buildVersion(b));
  });

  it('puts the version and file list ahead of the worker code', () => {
    expect(workerScript('abc', ['./'], 'body')).toBe('const VERSION = "abc";\nconst PRECACHE = ["./"];\nbody');
  });
});

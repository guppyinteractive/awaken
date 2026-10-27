import { defineConfig, type Plugin } from 'vite';
import { fileURLToPath } from 'node:url';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { buildVersion, precacheUrls, workerScript } from './src/sw/precache';

const page = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/** Writes dist/sw.js with every built file to cache and a version that changes per deploy. */
function serviceWorker(): Plugin {
  let outDir = '';
  return {
    name: 'service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const paths = readdirSync(outDir, { recursive: true, withFileTypes: true })
        .filter((d) => d.isFile())
        .map((d) => relative(outDir, join(d.parentPath, d.name)).split('\\').join('/'))
        .filter((p) => p !== 'sw.js');
      const body = readFileSync(page('./src/sw/sw.js'), 'utf8');
      const files = paths.map((path) => ({ path, content: readFileSync(join(outDir, path)) }));
      files.push({ path: 'sw.js', content: Buffer.from(body) }); // a worker change is a new version too
      writeFileSync(join(outDir, 'sw.js'), workerScript(buildVersion(files), precacheUrls(paths), body));
    },
  };
}

export default defineConfig({
  // Served from www.guppyinteractive.com/primal/
  base: '/primal/',
  plugins: [serviceWorker()],
  build: {
    rollupOptions: {
      input: {
        main: page('./index.html'),
        fight: page('./fight/index.html'),
        hunters: page('./hunters/index.html'),
        campaign: page('./campaign/index.html'),
      },
    },
  },
});

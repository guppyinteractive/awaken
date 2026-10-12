import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const page = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  // Served from www.guppyinteractive.com/awaken/
  base: '/awaken/',
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

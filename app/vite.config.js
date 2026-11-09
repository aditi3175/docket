// Vite config for Docket's presentation layer. The app imports the dependency-free read logic from
// ../web/assets unchanged, so the dev server may read one level up. The census (../graph.json, written by
// tools/crawl.mjs) is served in dev and copied into the build, so the static output is self-contained.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const graphPath = fileURLToPath(new URL('../graph.json', import.meta.url));

function census() {
  return {
    name: 'docket-census',
    configureServer(server) {
      server.middlewares.use('/graph.json', (_req, res) => {
        res.setHeader('content-type', 'application/json');
        res.end(readFileSync(graphPath));
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'graph.json', source: readFileSync(graphPath) });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwind(), census()],
  server: { fs: { allow: ['..'] } },
  build: { outDir: '../dist', emptyOutDir: true },
});

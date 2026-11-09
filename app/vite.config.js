// Vite config for Docket's presentation layer. The app imports the dependency-free read logic from
// ../web/assets unchanged, so the dev server may read one level up. The census (../graph.json, written by
// tools/crawl.mjs) is served in dev and copied into the build, so the static output is self-contained.
// The tool pages (web/account.html, docket.html, register.html, optout.html) are plain HTML + ES modules with
// no build step; they and web/assets are copied into the build as they are, so every nav link resolves.
// The homepage is the React app (index.html); web/index.html is not copied over it.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const graphPath = fileURLToPath(new URL('../graph.json', import.meta.url));
const WEB = fileURLToPath(new URL('../web/', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.txt': 'text/plain' };

// web/'s files to publish: every page except index.html, and everything under assets/
function webFiles() {
  const pages = readdirSync(WEB).filter((f) => f.endsWith('.html') && f !== 'index.html');
  const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
  return [...pages.map((f) => join(WEB, f)), ...walk(join(WEB, 'assets'))].map((p) => relative(WEB, p).split('\\').join('/'));
}

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

function toolPages() {
  return {
    name: 'docket-tool-pages',
    configureServer(server) {
      const files = new Set(webFiles());
      server.middlewares.use((req, res, next) => {
        const p = decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\//, '');
        if (!files.has(p) || !existsSync(join(WEB, p))) return next();
        res.setHeader('content-type', TYPES[extname(p)] ?? 'application/octet-stream');
        res.end(readFileSync(join(WEB, p)));
      });
    },
    generateBundle(_opts, bundle) {
      for (const f of webFiles()) {
        if (bundle[f]) throw new Error(`web/${f} would overwrite a built file of the same name`);
        this.emitFile({ type: 'asset', fileName: f, source: readFileSync(join(WEB, f)) });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwind(), census(), toolPages()],
  server: { fs: { allow: ['..'] } },
  build: { outDir: '../dist', emptyOutDir: true },
});

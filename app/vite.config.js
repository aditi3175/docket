// Vite config for Docket's presentation layer (React, no CSS framework). The app imports the dependency-free read logic from
// ../web/assets unchanged, so the dev server may read one level up. The census (../graph.json, written by
// tools/crawl.mjs) is served in dev and copied into the build, so the static output is self-contained.
// The tool pages (web/account.html, docket.html, register.html, optout.html) are plain HTML + ES modules with
// no build step; they and web/assets are copied into the build as they are, so every nav link resolves.
// The homepage is the React app (index.html); web/index.html is not copied over it.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
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

// Deployed addresses carry no ".html": /account?account=…, and / for the homepage. The source keeps its
// .html links (so web/ works with no build at all); the build rewrites every link to one of the five pages.
// A name preceded by "/", "." or a word character (web/index.html, foo.account.html) is not a page link.
export const PAGE_LINK = /(?<![\w./-])(index|account|docket|register|optout)\.html\b/g;
export const cleanLinks = (s) => s.replace(PAGE_LINK, (_, p) => (p === 'index' ? '/' : `/${p}`));

// Build only: the React bundle's own links (app/src) and the logic it imports (web/assets) are rewritten too.
function cleanUrls() {
  let build = false;
  return {
    name: 'docket-clean-urls',
    configResolved(c) { build = c.command === 'build'; },
    transform(code, id) {
      const p = id.split('\\').join('/');
      if (!build || !/\.(jsx?|mjs)$/.test(p) || !/\/(app\/src|web\/assets)\//.test(p)) return null;
      return { code: cleanLinks(code), map: null };
    },
    // `npm run preview` serves dist/ the way the host does: /account is account.html
    configurePreviewServer(server) {
      const dist = fileURLToPath(new URL('../dist/', import.meta.url));
      server.middlewares.use((req, _res, next) => {
        const [path, query] = (req.url ?? '').split('?');
        const name = path.replace(/^\//, '');
        if (/^[a-z]+$/.test(name) && existsSync(join(dist, `${name}.html`))) req.url = `/${name}.html${query ? `?${query}` : ''}`;
        next();
      });
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
        // pages and scripts get clean links (above); fonts and other binaries are copied byte for byte
        const source = /\.(html|js)$/.test(f) ? cleanLinks(readFileSync(join(WEB, f), 'utf8')) : readFileSync(join(WEB, f));
        this.emitFile({ type: 'asset', fileName: f, source });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), census(), toolPages(), cleanUrls()],
  server: { fs: { allow: ['..'] } },
  build: { outDir: '../dist', emptyOutDir: true },
});

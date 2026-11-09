// path.js — the authority path, drawn: nodes are HTML in a CSS grid, edges are one SVG overlay computed
// from the nodes' boxes. Used by index.html (the hero) and account.html (full size).
//
// Honest motion: an edge is drawn when the read behind it resolves (setEdge(..., { state: 'live' })).
// Until then it shows the last recorded value, faint, or nothing. prefers-reduced-motion renders each
// edge complete at once. Colour: 'novote' (red) only for an edge the factory crosses without a vote,
// 'optedout' (green) only for an opted-out DAO, 'unknown' (dashed, no colour) for a failed read.
// Every text is set with textContent: chain data never becomes markup.

const SVG = 'http://www.w3.org/2000/svg';
const MOBILE = '(max-width: 860px)';

export function keyGlyph(doc = document) {
  const s = doc.createElementNS(SVG, 'svg');
  s.setAttribute('viewBox', '0 0 52 26'); s.setAttribute('class', 'keyglyph'); s.setAttribute('aria-hidden', 'true');
  const add = (tag, attrs) => { const e = doc.createElementNS(SVG, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); s.append(e); };
  const stroke = { fill: 'none', stroke: 'currentColor', 'stroke-width': '3', 'stroke-linecap': 'round' };
  add('circle', { cx: '12', cy: '13', r: '8.5', ...stroke });
  add('path', { d: 'M21 13H50M41 13V20M48 13V19', ...stroke });
  return s;
}

export function createPath(host, { reducedMotion } = {}) {
  const doc = host.ownerDocument;
  const win = doc.defaultView;
  const still = reducedMotion ?? win.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mobile = () => win.matchMedia(MOBILE).matches;
  host.classList.add('path');
  const grid = doc.createElement('div'); grid.className = 'path-grid';
  const svg = doc.createElementNS(SVG, 'svg'); svg.setAttribute('class', 'edges'); svg.setAttribute('aria-hidden', 'true');
  host.append(svg, grid);
  const nodes = new Map();
  const edges = new Map();

  function el(tag, cls, text) { const e = doc.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }

  // opts: { col, row, span, mrow, cls, title, mono, sub, note, noteCls, href, label (aria) }
  function addNode(id, opts) {
    const n = el('div', `node ${opts.cls ?? ''}`.trim());
    n.style.setProperty('--col', opts.col); n.style.setProperty('--row', opts.row);
    if (opts.span) n.style.setProperty('--span', opts.span);
    n.style.setProperty('--mrow', opts.mrow ?? opts.row);
    nodes.set(id, { el: n, opts });
    setNode(id, opts);
    grid.append(n);
    return n;
  }

  function setNode(id, { title, mono, sub, note, noteCls, href, state, children } = {}) {
    const rec = nodes.get(id); if (!rec) return;
    const n = rec.el;
    if (title !== undefined) rec.opts.title = title;
    if (mono !== undefined) rec.opts.mono = mono;
    if (sub !== undefined) rec.opts.sub = sub;
    if (note !== undefined) { rec.opts.note = note; rec.opts.noteCls = noteCls; }
    if (href !== undefined) rec.opts.href = href;
    const o = rec.opts;
    n.replaceChildren();
    const inner = o.href ? el('a') : el('span');
    if (o.href) inner.href = o.href;
    if (o.title !== undefined) inner.append(el('span', `t${o.mono ? ' id' : ''}${o.titleCls ? ` ${o.titleCls}` : ''}`, o.title));
    if (o.sub) inner.append(el('span', 's', o.sub));
    if (o.note) inner.append(el('span', `s note-m ${o.noteCls ?? ''}`, o.note));
    n.append(inner);
    if (children) n.append(...children);
    if (state !== undefined) {
      n.classList.toggle('is-recorded', state === 'recorded');
      n.classList.toggle('is-unknown', state === 'unknown');
    }
    queue();
  }

  // opts: { kind: 'plain'|'novote'|'optedout'|'unknown', state: 'recorded'|'live'|'hidden', label, m: 'down'|'gutter'|'drop', lane }
  function addEdge(id, from, to, opts = {}) {
    const p = doc.createElementNS(SVG, 'path');
    const t = doc.createElementNS(SVG, 'text');
    svg.append(p, t);
    edges.set(id, { from, to, p, t, opts: { kind: 'plain', state: 'hidden', m: 'down', lane: 0, ...opts } });
    paint(id, false);
    queue();
  }

  function setEdge(id, next) {
    const e = edges.get(id); if (!e) return;
    const wasLive = e.opts.state === 'live';
    Object.assign(e.opts, next);
    paint(id, e.opts.state === 'live' && !wasLive && !still);
  }

  function paint(id, animate) {
    const e = edges.get(id);
    const { kind, state, label } = e.opts;
    e.p.setAttribute('class', `edge ${kind === 'plain' ? '' : kind} ${state === 'recorded' ? 'recorded' : ''}`.replace(/\s+/g, ' ').trim());
    e.p.style.visibility = state === 'hidden' ? 'hidden' : 'visible';
    e.t.setAttribute('class', `edge-label ${kind === 'novote' ? '' : kind}`.trim());
    e.t.textContent = label && state === 'live' ? label : '';
    e.p.style.strokeDasharray = ''; e.p.style.strokeDashoffset = ''; e.p.classList.remove('drawing');
    route(e);
    if (animate && kind !== 'unknown' && typeof e.p.getTotalLength === 'function') {
      const len = e.p.getTotalLength();
      if (len > 0) {
        e.p.style.strokeDasharray = `${len}`; e.p.style.strokeDashoffset = `${len}`;
        e.p.getBoundingClientRect(); // commit the start state before the transition
        e.p.classList.add('drawing'); e.p.style.strokeDashoffset = '0';
        e.p.addEventListener('transitionend', () => { e.p.style.strokeDasharray = ''; e.p.style.strokeDashoffset = ''; e.p.classList.remove('drawing'); }, { once: true });
      }
    }
  }

  const box = (id) => {
    const target = nodes.get(id)?.el ?? doc.getElementById(id);
    if (!target) return null;
    const h = host.getBoundingClientRect(); const r = target.getBoundingClientRect();
    return { l: r.left - h.left, r: r.right - h.left, t: r.top - h.top, b: r.bottom - h.top, cx: (r.left + r.right) / 2 - h.left, cy: (r.top + r.bottom) / 2 - h.top };
  };

  function route(e) {
    const a = box(e.from), b = box(e.to);
    if (!a || !b) return;
    let d;
    if (!mobile()) {
      const dx = Math.max(24, (b.l - a.r) / 2);
      d = `M${a.r} ${a.cy} C${a.r + dx} ${a.cy} ${b.l - dx} ${b.cy} ${b.l} ${b.cy}`;
    } else if (e.opts.m === 'gutter') {
      const gx = 8 + e.opts.lane * 9; const ty = b.t + 14 + e.opts.lane * 9; const r = 7;
      d = `M${a.l} ${a.cy} H${gx + r} Q${gx} ${a.cy} ${gx} ${a.cy + r} V${ty - r} Q${gx} ${ty} ${gx + r} ${ty} H${b.l}`;
    } else if (e.opts.m === 'drop') {
      d = `M${b.cx} ${a.b} V${b.t}`;
    } else {
      const x = a.l + 22;
      d = `M${x} ${a.b} V${b.t}`;
    }
    e.p.setAttribute('d', d);
    if (e.t.textContent && typeof e.p.getTotalLength === 'function') {
      const len = e.p.getTotalLength(); const m = e.p.getPointAtLength(len * 0.42);
      e.t.setAttribute('x', String(m.x)); e.t.setAttribute('y', String(m.y - 9)); e.t.setAttribute('text-anchor', 'middle');
    }
  }

  let pending = false;
  function queue() { if (pending) return; pending = true; win.requestAnimationFrame(() => { pending = false; redraw(); }); }
  function redraw() { for (const e of edges.values()) route(e); }
  if (win.ResizeObserver) new win.ResizeObserver(queue).observe(host);
  win.matchMedia(MOBILE).addEventListener?.('change', queue);
  doc.fonts?.ready?.then(queue);

  return { addNode, setNode, addEdge, setEdge, redraw, node: (id) => nodes.get(id)?.el };
}

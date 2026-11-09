// iso.js — isometric (3D) scenes, drawn as SVG from answers already read. Two kinds:
//   drawPathScene  the homepage's story: the factory's keys → the factory → each DAO → each deposit, with
//                  the members' vote as a gate the path goes straight through (or stops at, when opted out)
//   drawSteps      a page's "how it works" strip: three objects in 3D with arrows between them
//
// Presentation only, like diagrams.js: every label and figure is passed in by the caller from a read or a
// labelled recording; nothing here computes one (I2). Text is set with textContent. Red only for the
// no-vote path, violet only for opted out, dashed grey for unknown. Under prefers-reduced-motion the
// scene is drawn complete and still.

const SVG = 'http://www.w3.org/2000/svg';
const still = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? true;
function sv(tag, attrs = {}, text) { const e = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(attrs)) if (v !== undefined) e.setAttribute(k, String(v)); if (text !== undefined) e.textContent = text; return e; }
function onView(node, fn) {
  if (still() || !globalThis.IntersectionObserver) { fn(true); return; }
  const io = new IntersectionObserver((es) => { if (es.some((x) => x.isIntersecting)) { io.disconnect(); fn(false); } }, { threshold: 0.25 });
  io.observe(node);
}

// ---- projection: world (x, y, z) in units → screen. x runs down-right, y down-left, z up.
const K = 26; const C = Math.cos(Math.PI / 6) * K; const S = Math.sin(Math.PI / 6) * K;
const P = (x, y, z = 0) => [(x - y) * C, (x + y) * S - z * K];
const pts = (a) => a.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

// One box: top, the face toward +y (left on screen) and the face toward +x (right on screen).
// tone: 'ink' | 'steel' | 'paper' | 'novote' | 'optedout' | 'unknown' (top colour); the sides shade it.
function box(g, { x, y, z = 0, w, d, h, tone = 'steel', top = tone, cls = '' }) {
  const a = P(x, y + d, z), b = P(x + w, y + d, z), c = P(x + w, y, z);
  const at = P(x, y + d, z + h), bt = P(x + w, y + d, z + h), ct = P(x + w, y, z + h), dt = P(x, y, z + h);
  const grp = sv('g', { class: `iso-box ${cls}`.trim() });
  grp.append(
    sv('polygon', { points: pts([a, b, bt, at]), class: `f-l t-${tone}` }),
    sv('polygon', { points: pts([b, c, ct, bt]), class: `f-r t-${tone}` }),
    sv('polygon', { points: pts([at, bt, ct, dt]), class: `f-t t-${top}` }),
  );
  g.append(grp);
  return { top: P(x + w / 2, y + d / 2, z + h), base: P(x + w / 2, y + d / 2, z), grp };
}

// A label: a bold line and an optional small line under it, centred on a screen point.
function label(g, [x, y], main, sub, cls = '') {
  const t = sv('g', { class: `iso-label ${cls}`.trim() });
  t.append(sv('text', { x, y, 'text-anchor': 'middle', class: 'l-main' }, main));
  if (sub) t.append(sv('text', { x, y: y + 15, 'text-anchor': 'middle', class: 'l-sub' }, sub));
  g.append(t);
  return t;
}

// Fit the viewBox to what was drawn.
function fit(svg, pad = 18) {
  const b = svg.getBBox();
  svg.setAttribute('viewBox', `${(b.x - pad).toFixed(0)} ${(b.y - pad).toFixed(0)} ${(b.width + pad * 2).toFixed(0)} ${(b.height + pad * 2).toFixed(0)}`);
}

// ---------------------------------------------------------------- the homepage's story
// model: { keys: number|null, rows: [{ name, dao, value, au: true|false|'unknown' }] }
// Two layouts: across (desktop, the story runs left to right) and down (phones, top to bottom).
export function drawPathScene(host, model) {
  host.classList.add('iso-scene');
  let drawnFor = null;
  const draw = (animate) => {
    const down = host.clientWidth < 640;
    if (drawnFor === down && !animate) return;
    drawnFor = down;
    host.replaceChildren();
    const svg = sv('svg', { class: `iso-svg${down ? ' down' : ''}`, role: 'img', 'aria-label': ariaOf(model) });
    host.append(svg);
    // stage u (along the story) and spread v (across it) → world x, y
    // the story runs along world x (down-right on screen), the DAOs step along world y (down-left): the
    // true isometric axes, so the gate across the roads and the blocks' depth read as 3D at any width
    const W = (u, v) => [u, v];
    // stage positions, spacing and label lifts, chosen so no label overlaps another label or a block
    // (checked by projecting every box and label, at both widths): phones get larger, single-line labels
    const L = down ? { U: [0, 6, 12.5, 19.5], spread: 6.2, k: 46, f: 56, d: 24, v: 52 } : { U: [0, 4.5, 9.5, 15], spread: 5, k: 46, f: 44, d: 38, v: 52 };
    const [UK, UF, UD, UV] = L.U; const spread = L.spread; const sub = (t) => (down ? null : t);
    const rows = model.rows.slice(0, 3);
    const vs = rows.map((_, i) => (i - (rows.length - 1) / 2) * spread);
    const ground = sv('g', { class: 'iso-ground' }); const solid = sv('g'); const marks = sv('g'); const flows = sv('g');
    svg.append(ground, flows, solid, marks);

    // the floor: a faint tile under the whole story
    const corners = [W(-1.6, -spread * 1.6), W(UV + 1.6, -spread * 1.6), W(UV + 1.6, spread * 1.6), W(-1.6, spread * 1.6)].map(([x, y]) => P(x, y));
    ground.append(sv('polygon', { points: pts(corners), class: 'floor' }));

    const at = (u, v, w, d, h, opts) => { const [x, y] = W(u, v); return box(solid, { x: x - w / 2, y: y - d / 2, w, d, h, ...opts }); };
    const order = []; // [element, delay index] for the entrance

    // 1 · the keys
    const n = model.keys;
    if (typeof n === 'number' && n > 0) {
      const kv = Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * 0.75);
      kv.forEach((v) => order.push([at(UK, v, 0.45, 0.45, 1.5, { tone: 'ink', cls: 'key' }).grp, 0]));
    } else order.push([at(UK, 0, 1.2, 1.2, 0.6, { tone: 'unknown', cls: 'key' }).grp, 0]);
    const keyTop = P(...W(UK, 0), 1.5);
    order.push([label(marks, [keyTop[0], keyTop[1] - L.k], typeof n === 'number' ? `${n} key${n === 1 ? '' : 's'}` : 'keys: unknown', sub('full access')), 0]);

    // 2 · the factory
    const fac = at(UF, 0, 1.9, 1.9, 1.8, { tone: 'ink', cls: 'factory' });
    order.push([fac.grp, 1], [label(marks, [fac.top[0], fac.top[1] - L.f], 'the factory', sub('sputnik-dao.near')), 1]);

    // 3 · the members' vote: a gate across every DAO's road, raised, that the update never stops at
    const gu = (UF + UD) / 2 + 0.3; const [gx0, gy0] = W(gu, vs[0] - 1.1); const [gx1, gy1] = W(gu, vs[vs.length - 1] + 1.1);
    const gate = sv('g', { class: 'gate-iso' });
    const p0 = P(gx0, gy0), p1 = P(gx1, gy1), p0t = P(gx0, gy0, 2.2), p1t = P(gx1, gy1, 2.2);
    gate.append(sv('line', { x1: p0[0], y1: p0[1], x2: p0t[0], y2: p0t[1] }), sv('line', { x1: p1[0], y1: p1[1], x2: p1t[0], y2: p1t[1] }),
      sv('line', { x1: p0t[0], y1: p0t[1], x2: p1t[0], y2: p1t[1], class: 'bar' }));
    solid.append(gate);
    const anyOpen = rows.some((r) => r.au === true);
    const gl = [(p0t[0] + p1t[0]) / 2, Math.min(p0t[1], p1t[1]) - 14];
    order.push([gate, 2], [label(marks, gl, "members' vote", anyOpen ? (down ? 'skipped' : 'skipped by update()') : 'required', `gate-l ${anyOpen ? 'novote' : 'optedout'}`), 2]);

    // 4 · each DAO, its road from the factory, and the deposit it owns
    rows.forEach((r, i) => {
      const v = vs[i];
      const tone = r.au === true ? 'novote' : r.au === false ? 'optedout' : 'unknown';
      const road = (u0, u1, kind, delay) => {
        const a = P(...W(u0, kind === 'k' ? 0 : v)), b = P(...W(u1, v));
        const m = P(...W(u0 + (u1 - u0) * 0.35, kind === 'k' ? 0 : v));
        const path = sv('path', { d: `M${a[0]} ${a[1]} L${m[0]} ${m[1]} L${b[0]} ${b[1]}`, class: `flow ${tone}` });
        flows.append(path); order.push([path, delay]);
      };
      road(UF, UD, 'k', 3);
      const dao = at(UD, v, 1.4, 1.4, 1.1, { tone: 'paper', top: tone, cls: 'dao' });
      order.push([dao.grp, 3], [label(marks, [dao.top[0], dao.top[1] - L.d], down ? r.name : `${r.name} DAO`, sub(r.au === true ? 'auto_update: true' : r.au === false ? 'auto_update: false' : 'auto_update: unknown'), `dao-l ${tone}`), 3]);
      if (r.au !== false) road(UD, UV, 'd', 4);
      const vault = at(UV, v, 1.5, 1.5, 1.4, { tone: 'steel', cls: 'vault' });
      // the deposit, as a stack of coins on the vault (height is not to scale: the label carries the figure)
      for (let c = 0; c < 3; c++) { const [x, y] = W(UV, v); box(solid, { x: x - 0.35, y: y - 0.35, z: 1.4 + c * 0.22, w: 0.7, d: 0.7, h: 0.18, tone: 'coin', cls: 'coin' }); }
      order.push([vault.grp, 4], [label(marks, [vault.top[0], vault.top[1] - L.v], r.value, sub(r.name), `val-l${r.value === 'unknown' ? ' unknown' : ''}`), 4]);
    });
    // the key-to-factory road
    { const a = P(...W(UK, 0)), b = P(...W(UF, 0)); const path = sv('path', { d: `M${a[0]} ${a[1]} L${b[0]} ${b[1]}`, class: `flow ${anyOpen ? 'novote' : 'plain'}` }); flows.prepend(path); order.push([path, 1]); }

    fit(svg, down ? 26 : 22);
    if (animate) {
      svg.classList.add('pre');
      for (const [e, d] of order) e.style.setProperty('--d', String(d));
      requestAnimationFrame(() => requestAnimationFrame(() => svg.classList.remove('pre')));
    }
  };
  // one resize observer per host, always redrawing the latest model (live figures replace recorded ones)
  host.__isoDraw = draw;
  onView(host, (instant) => {
    draw(!instant);
    if (globalThis.ResizeObserver && !host.__isoRO) { host.__isoRO = new ResizeObserver(() => host.__isoDraw(false)); host.__isoRO.observe(host); }
  });
}
function ariaOf(m) {
  const k = typeof m.keys === 'number' ? `${m.keys} full-access keys` : 'the factory keys (unknown count)';
  return `${k} sign for the factory sputnik-dao.near, which calls update() on ${m.rows.map((r) => `${r.name}'s DAO (auto_update ${String(r.au)}, ${r.value})`).join(', ')}, without the members' vote.`;
}

// ---------------------------------------------------------------- a page's "how it works" strip
// steps: [{ obj: 'account'|'walk'|'keys'|'doc'|'decode'|'stamp'|'cubes'|'towers'|'lock'|'proposal'|'vote', title, sub }]
const OBJ = {
  account: (g) => { box(g, { x: -0.8, y: -0.8, w: 1.6, d: 1.6, h: 0.9, tone: 'paper', top: 'paper' }); },
  walk: (g) => { box(g, { x: -0.7, y: -0.7, w: 1.4, d: 1.4, h: 0.6, tone: 'paper' }); box(g, { x: -0.55, y: -0.55, z: 0.75, w: 1.1, d: 1.1, h: 0.6, tone: 'steel' }); box(g, { x: -0.4, y: -0.4, z: 1.5, w: 0.8, d: 0.8, h: 0.6, tone: 'ink' }); },
  keys: (g) => { [-0.7, 0, 0.7].forEach((v) => box(g, { x: v - 0.2, y: -0.2 - v, w: 0.4, d: 0.4, h: 1.5, tone: 'ink' })); },
  doc: (g) => { box(g, { x: -0.9, y: -1.2, w: 1.8, d: 2.4, h: 0.12, tone: 'paper' }); [0, 1, 2, 3].forEach((i) => box(g, { x: -0.6, y: -0.9 + i * 0.5, z: 0.12, w: 1.2 - (i % 2) * 0.4, d: 0.12, h: 0.04, tone: 'steel' })); },
  decode: (g) => { box(g, { x: -0.9, y: -0.9, w: 1.8, d: 1.8, h: 1.0, tone: 'ink' }); box(g, { x: -0.5, y: -0.5, z: 1.0, w: 1.0, d: 1.0, h: 0.25, tone: 'steel' }); },
  stamp: (g) => { box(g, { x: -0.9, y: -1.2, w: 1.8, d: 2.4, h: 0.12, tone: 'paper' }); box(g, { x: -0.35, y: -0.35, z: 0.12, w: 0.7, d: 0.7, h: 0.5, tone: 'novote', cls: 'stamp-b' }); box(g, { x: -0.15, y: -0.15, z: 0.62, w: 0.3, d: 0.3, h: 0.9, tone: 'ink' }); },
  cubes: (g) => { for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) box(g, { x: -1 + i * 0.75, y: -1 + j * 0.75, w: 0.5, d: 0.5, h: 0.5, tone: (i + j) % 4 === 3 ? 'optedout' : 'novote' }); },
  towers: (g) => { [[-0.9, 2.2, 'optedout'], [-0.1, 1.5, 'novote'], [0.7, 1.0, 'novote']].forEach(([v, h, t]) => box(g, { x: v - 0.3, y: -0.3 - v * 0.2, w: 0.6, d: 0.6, h, tone: 'paper', top: t })); },
  proposal: (g) => { box(g, { x: -0.9, y: -1.2, w: 1.8, d: 2.4, h: 0.12, tone: 'paper' }); box(g, { x: -0.5, y: -0.2, z: 0.12, w: 1.0, d: 0.4, h: 0.06, tone: 'optedout' }); },
  vote: (g) => { [-0.75, 0, 0.75].forEach((v, i) => box(g, { x: v - 0.25, y: -0.25 - v, w: 0.5, d: 0.5, h: 0.9 + (i === 1 ? 0.3 : 0), tone: 'paper', top: 'optedout' })); },
  lock: (g) => { box(g, { x: -0.8, y: -0.5, w: 1.6, d: 1.0, h: 1.2, tone: 'optedout' }); const [x1, y1] = P(-0.55, 0, 1.2), [x2, y2] = P(0.55, 0, 1.2), [xa, ya] = P(-0.55, 0, 2.1), [xb, yb] = P(0.55, 0, 2.1);
    g.append(sv('path', { d: `M${x1} ${y1} L${xa} ${ya} Q${(xa + xb) / 2} ${ya - 16} ${xb} ${yb} L${x2} ${y2}`, class: 'shackle-iso' })); },
};
export function drawSteps(host, steps) {
  host.classList.add('iso-steps');
  host.replaceChildren();
  const row = document.createElement('ol'); row.className = 'iso-row';
  steps.forEach((s, i) => {
    const li = document.createElement('li'); li.style.setProperty('--d', String(i));
    const svg = sv('svg', { class: 'iso-obj', 'aria-hidden': 'true' }); const g = sv('g'); svg.append(g);
    (OBJ[s.obj] ?? OBJ.account)(g);
    const t = document.createElement('b'); t.textContent = s.title;
    const u = document.createElement('span'); u.textContent = s.sub ?? '';
    li.append(svg, t, u); row.append(li);
    if (i < steps.length - 1) { const a = document.createElement('li'); a.className = 'iso-arrow'; a.setAttribute('aria-hidden', 'true'); a.style.setProperty('--d', String(i + 0.5)); row.append(a); }
  });
  host.append(row);
  // each object's viewBox fits it once it is in the document
  for (const svg of row.querySelectorAll('svg.iso-obj')) fit(svg, 6);
  onView(host, (instant) => { if (!instant) { host.classList.add('pre'); requestAnimationFrame(() => requestAnimationFrame(() => host.classList.remove('pre'))); } });
}

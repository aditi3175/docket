// diagrams.js — the site's five diagrams, drawn into a host element from answers already read:
//   drawWaffle   the census, one square per DAO, in three labelled blocks        (homepage)
//   drawTower    one authority path as floors, with a crack where no vote stands  (account)
//   drawTreemap  administered value per DAO, coloured by auto_update            (register)
//   drawLock     the three factory keys and the fourth lock, the DAO's vote       (opt out)
// (the proposals' stamps are plain CSS on docket.html's flags.)
//
// Presentation only. Every figure shown is passed in by the caller from a read, the census (I20) or
// a labelled recording; nothing here computes, rounds or invents one (I2). Text is set with
// textContent, never markup. Red only for no vote, violet only for opted out, dashed for unknown.
// Motion starts when the diagram scrolls into view and is skipped under prefers-reduced-motion.

const SVG = 'http://www.w3.org/2000/svg';
const still = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? true;
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
function sv(tag, attrs = {}) { const e = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v)); return e; }
function onView(node, fn) {
  if (still() || !globalThis.IntersectionObserver) { fn(true); return; }
  const io = new IntersectionObserver((es) => { if (es.some((x) => x.isIntersecting)) { io.disconnect(); fn(false); } }, { threshold: 0.2 });
  io.observe(node);
}
export function keyGlyph(w = 40) {
  const s = sv('svg', { viewBox: '0 0 52 26', width: w, height: w / 2, class: 'keyglyph', 'aria-hidden': 'true' });
  const st = { fill: 'none', stroke: 'currentColor', 'stroke-width': 3, 'stroke-linecap': 'round' };
  s.append(sv('circle', { cx: 12, cy: 13, r: 8.5, ...st }), sv('path', { d: 'M21 13H50M41 13V20M48 13V19', ...st }));
  return s;
}

// ---------------------------------------------------------------- the census as three blocks
// records: [{ id, autoUpdate }] from graph.json; counts: census(records).counts (I20: the same records)
export function drawWaffle(host, records, counts, { href = (id) => `docket.html?dao=${encodeURIComponent(id)}` } = {}) {
  const fmt = (n) => n.toLocaleString('en-US');
  const unknown = counts['no-factory-info'] + counts.unread;
  const groups = [
    { k: 'novote', n: counts.true, label: 'can have their code replaced by the factory without a vote', pick: (a) => a === 'true', word: 'auto_update: true' },
    { k: 'optedout', n: counts.false, label: 'opted out: a vote is required', pick: (a) => a === 'false', word: 'auto_update: false' },
    { k: 'unknown', n: unknown, label: `unknown: ${fmt(counts['no-factory-info'])} have no get_factory_info, ${fmt(counts.unread)} unread`, pick: (a) => a !== 'true' && a !== 'false', word: null },
  ];
  host.replaceChildren(); host.classList.add('waffle');
  const tip = el('p', 'waffle-tip', 'Hover a square for its DAO; click to read its proposals.');
  const blocks = [];
  for (const g of groups) {
    const b = el('div', `wb ${g.k}`);
    b.style.setProperty('--n', String(g.n));
    b.append(el('div', 'wb-n', fmt(g.n)), el('div', 'wb-l', g.label));
    const cells = el('div', 'cells'); cells.setAttribute('role', 'img'); cells.setAttribute('aria-label', `${fmt(g.n)} DAOs ${g.label}`);
    for (const r of records) if (g.pick(r.autoUpdate)) {
      const i = el('a'); i.href = href(r.id); i.dataset.id = r.id;
      i.dataset.w = g.word ?? (r.autoUpdate === 'no-factory-info' ? 'no get_factory_info' : 'unread');
      i.setAttribute('aria-label', `${r.id}, ${i.dataset.w}`); i.tabIndex = -1;
      cells.append(i);
    }
    const show = (e) => { const t = e.target.closest('a'); if (t) tip.textContent = `${t.dataset.id} · ${t.dataset.w}`; };
    cells.addEventListener('mouseover', show); cells.addEventListener('focusin', show);
    b.append(cells); host.append(b); blocks.push(cells);
  }
  host.append(tip);
  onView(host, (instant) => {
    if (instant) { host.classList.add('filled'); return; }
    host.classList.add('filling');
    blocks.forEach((cells, bi) => {
      const cs = cells.children; const per = Math.max(1, Math.ceil(cs.length / 45)); let j = 0;
      const step = () => { for (let k = 0; k < per && j < cs.length; k++, j++) cs[j].classList.add('on'); if (j < cs.length) requestAnimationFrame(step); else if (bi === blocks.length - 1) host.classList.add('filled'); };
      setTimeout(() => requestAnimationFrame(step), bi * 380);
    });
  });
}

// ---------------------------------------------------------------- the authority path as a tower
// dm: diagramOf(group, value) -> { nodes:[{kind,label,sub}], edges:[{text,noVote}] }, top (value) first.
// Every hop of a group is reached with no vote (that is what a group is), so the crack runs from the
// keys up to the account asked about; the joint the factory crosses without a vote is named.
export function drawTower(host, dm, { valueState = 'ok', keyCount = 0, keyNote = '', account = (id) => `account.html?account=${encodeURIComponent(id)}` } = {}) {
  host.replaceChildren(); host.classList.add('tower');
  const parts = [];
  dm.nodes.forEach((n, i) => {
    if (i > 0) {
      const e = dm.edges[i - 1];
      // every joint below the account asked about is part of the crack's run (i > 1)
      const j = el('div', `joint${e.noVote ? ' novote' : ''}${i > 1 ? ' run' : ''}`);
      j.append(el('i'), el('span', 'joint-l', e.noVote ? 'no vote · auto_update: true' : e.text));
      host.append(j); parts.push(j);
    }
    const f = el(n.kind === 'account' ? 'a' : 'div', `floor ${n.kind}${n.kind === 'value' && valueState !== 'ok' ? ' is-unknown' : ''}`);
    if (n.kind === 'value') { f.append(el('b', 'fv', n.label)); if (n.sub) f.append(el('small', 'fs', n.sub)); }
    else if (n.kind === 'keys') {
      const kk = el('span', 'kk'); const shown = Math.min(keyCount, 6);
      for (let k = 0; k < shown; k++) kk.append(keyGlyph(34));
      if (keyCount > shown) kk.append(el('span', 'more', `+${keyCount - shown}`));
      f.append(kk, el('small', 'fs', keyNote || `${n.label}, ${n.sub}`));
    } else {
      f.href = account(n.label);
      f.append(el('span', 'fid', n.label), el('small', 'fs', i === 1 ? 'the account you asked about' : 'can change the floor above'));
    }
    host.append(f); parts.push(f);
  });
  const crack = sv('svg', { class: 'crack novote', 'aria-hidden': 'true' }); const path = sv('path'); crack.append(path); host.append(crack);

  // the crack: a jagged line on the joints' axis, from the keys' floor to the first account's floor
  function route() {
    const tb = host.getBoundingClientRect(); const floors = [...host.querySelectorAll('.floor')];
    const top = floors.find((f) => f.classList.contains('account')); const keys = floors.at(-1);
    const axis = host.querySelector('.joint i');
    if (!top || !keys || !axis || !tb.height) return false;
    const x0 = axis.getBoundingClientRect().left - tb.left + 1;
    const y0 = keys.getBoundingClientRect().top - tb.top + 2; const y1 = top.getBoundingClientRect().top - tb.top + 6;
    crack.setAttribute('width', tb.width); crack.setAttribute('height', tb.height);
    // an irregular fracture, the same every time: fixed offsets and step lengths, not random
    const dx = [0, -3, 2, -5, 1, 4, -2, 3, -4, 1, 5, -1, -3, 2];
    const dy = [17, 23, 15, 26, 19, 14, 22, 18, 25, 16];
    let d = `M${x0} ${y0.toFixed(1)}`; let s = 0;
    for (let y = y0; y > y1; s++) { y = Math.max(y - dy[s % dy.length], y1); d += ` L${(x0 + dx[(s + 1) % dx.length]).toFixed(1)} ${y.toFixed(1)}`; }
    path.setAttribute('d', d);
    return true;
  }
  const ro = globalThis.ResizeObserver ? new ResizeObserver(() => route()) : null;
  onView(host, (instant) => {
    if (instant) { parts.forEach((p) => p.classList.add('show')); route(); host.classList.add('cracked'); ro?.observe(host); return; }
    parts.forEach((p, i) => setTimeout(() => p.classList.add('show'), 80 + i * 120));
    setTimeout(() => {
      if (!route()) return;
      const L = path.getTotalLength(); path.style.strokeDasharray = `${L}`; path.style.strokeDashoffset = `${L}`;
      path.getBoundingClientRect(); host.classList.add('cracked');
      path.style.transition = 'stroke-dashoffset 1.1s cubic-bezier(.6,0,.3,1)'; path.style.strokeDashoffset = '0';
      path.addEventListener('transitionend', () => { path.style.strokeDasharray = ''; path.style.strokeDashoffset = ''; path.style.transition = ''; }, { once: true });
      ro?.observe(host);
    }, 140 + parts.length * 120);
  });
}

// ---------------------------------------------------------------- the treemap
// items: [{ value (a USD figure from DefiLlama), label, sub, title, kind: 'novote'|'optedout'|'unknown', href }]
function squarify(list, x, y, w, h, out) {
  if (!list.length || w <= 0 || h <= 0) return;
  const sum = list.reduce((s, i) => s + i.value, 0); const short = Math.min(w, h); const area = w * h;
  let row = []; let best = Infinity; let k = 0;
  for (; k < list.length; k++) {
    const trial = [...row, list[k]]; const rs = trial.reduce((s, i) => s + i.value, 0); const side = (rs / sum) * area / short;
    const worst = Math.max(...trial.map((i) => { const l = ((i.value / sum) * area) / side; return Math.max(side / l, l / side); }));
    if (worst > best) break; best = worst; row = trial;
  }
  const rs = row.reduce((s, i) => s + i.value, 0); const thick = (rs / sum) * area / short; let off = 0;
  for (const i of row) { const len = (i.value / rs) * short; out.push(w >= h ? { i, x, y: y + off, w: thick, h: len } : { i, x: x + off, y, w: len, h: thick }); off += len; }
  if (w >= h) squarify(list.slice(k), x + thick, y, w - thick, h, out); else squarify(list.slice(k), x, y + thick, w, h - thick, out);
}
export function drawTreemap(host, items) {
  host.classList.add('treemap');
  const list = items.filter((i) => Number.isFinite(i.value) && i.value > 0).sort((a, b) => b.value - a.value);
  let animated = false;
  const draw = (animate) => {
    const W = host.clientWidth; const H = host.clientHeight; if (!W || !H) return;
    const out = []; squarify(list, 0, 0, W, H, out); host.replaceChildren();
    out.forEach(({ i, x, y, w, h }, n) => {
      const r = el('a', `tile ${i.kind}`); r.href = i.href; r.title = i.title;
      Object.assign(r.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px`, transitionDelay: animate ? `${n * 80}ms` : '0ms' });
      if (w > 64 && h > 40) { r.append(el('b', 'tv', i.label)); if (h > 74 && w > 110) r.append(el('span', 'tn', i.sub)); if (h > 96 && w > 170) r.append(el('small', 'tid', i.id)); }
      host.append(r);
      if (animate) requestAnimationFrame(() => requestAnimationFrame(() => r.classList.add('in'))); else r.classList.add('in');
    });
  };
  onView(host, (instant) => { draw(!instant); animated = true; });
  if (globalThis.ResizeObserver) { let w0 = 0; new ResizeObserver(() => { if (animated && host.clientWidth !== w0) { w0 = host.clientWidth; draw(false); } }).observe(host); }
}

// ---------------------------------------------------------------- the fourth lock
// state: 'open' (auto_update: true read), 'shut' (auto_update: false read), 'unknown' (unread)
// steps: [{ title, sub }], at: index of the step the DAO is on (steps before it are done)
export function drawLock(host, { state, steps, at, dao }) {
  host.replaceChildren(); host.classList.add('lockplate-wrap');
  const plate = el('div', `lockplate ${state}${state === 'open' ? ' novote' : ''}`); plate.setAttribute('role', 'img');
  plate.setAttribute('aria-label', state === 'shut' ? `${dao}: the factory's keys are refused; a code change needs the DAO's vote` : state === 'open' ? `${dao}: the factory's three keys can change the code; the DAO's vote is not one of the locks` : `${dao}: unknown`);
  for (let k = 1; k <= 3; k++) {
    const s = el('div', 'slot');
    const g = sv('svg', { viewBox: '0 0 64 70', 'aria-hidden': 'true' });
    g.append(sv('circle', { cx: 32, cy: 28, r: 22, class: 'kh-plate' }), sv('circle', { cx: 32, cy: 23, r: 6, class: 'kh-hole' }), sv('path', { d: 'M28.5 26 L35.5 26 L37.5 40 L26.5 40 Z', class: 'kh-hole' }), sv('circle', { cx: 32, cy: 62, r: 5, class: 'kh-led' }));
    s.append(g, el('span', 'sl', `Factory key ${k}`), el('span', 'ss', state === 'shut' ? 'update() refused' : state === 'open' ? 'turns, no vote' : 'unknown'));
    plate.append(s);
  }
  const v = el('div', 'slot vote');
  const g = sv('svg', { viewBox: '0 0 64 70', 'aria-hidden': 'true' });
  g.append(sv('path', { d: 'M19 36 V22 a13 13 0 0 1 26 0 V36', class: 'shackle' }), sv('rect', { x: 11, y: 32, width: 42, height: 32, rx: 6, class: 'lbody' }), sv('circle', { cx: 32, cy: 46, r: 4.5, class: 'kh-hole' }), sv('rect', { x: 30.5, y: 48, width: 3, height: 9, class: 'kh-hole' }));
  v.append(g, el('span', 'sl', "The DAO's vote"), el('span', 'ss', state === 'shut' ? 'now required' : state === 'open' ? 'not a lock today' : 'unknown'));
  plate.append(v);
  const ol = el('ol', 'locksteps');
  steps.forEach((s, i) => {
    const li = el('li', `${i < at ? 'done' : i === at ? 'here' : ''}${i === steps.length - 1 ? ' last' : ''}`);
    li.append(el('i', undefined, i < at ? '✓' : String(i + 1)));
    const d = el('div'); d.append(el('b', undefined, s.title), el('span', undefined, s.sub));
    if (i === at && s.here) d.append(el('em', undefined, s.here));
    li.append(d); ol.append(li);
  });
  host.append(plate, ol);
  onView(host, (instant) => { if (!instant) { plate.classList.add('pre'); requestAnimationFrame(() => requestAnimationFrame(() => plate.classList.remove('pre'))); } });
}

// ---------------------------------------------------------------- a flowchart
// nodes: [{ title, sub, cls }] boxes left to right (top to bottom on phones); edges: [{ text, cls }] the
// label on the arrow after each node, optional. Plain boxes and arrows laid out by the page, so nothing
// can overlap. cls 'novote' | 'optedout' | 'unknown' colours a box or an arrow by the rules above.
export function drawFlow(host, nodes, edges = []) {
  host.replaceChildren(); host.classList.add('flowchart');
  const ol = el('ol', 'fc');
  nodes.forEach((n, i) => {
    const li = el('li', `fc-node${n.cls ? ` ${n.cls}` : ''}`);
    li.append(el('b', undefined, n.title));
    if (n.sub) li.append(el('span', undefined, n.sub));
    ol.append(li);
    if (i < nodes.length - 1) {
      const e = edges[i] ?? {};
      const a = el('li', `fc-edge${e.cls ? ` ${e.cls}` : ''}`); a.setAttribute('aria-hidden', 'true');
      a.append(el('i'));
      if (e.text) a.append(el('span', undefined, e.text));
      ol.append(a);
    }
  });
  host.append(ol);
}

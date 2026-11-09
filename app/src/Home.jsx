// The homepage as a vault. Every figure comes from ../web/assets through lib/finding.js: recorded values
// first and labelled, then replaced by live reads as they land. No figure is typed in here, and nothing
// here reads the chain except the census recount, which runs only on the reader's click (I20).
// Styling is shared with web/index.html: both use web/assets/home.css.
// Carried over: I2 (a failed read is shown as unknown, never a value), I9 (no reassuring words),
// I20 (the census from graph.json's records; the chain recount on click only).
import { useCallback, useEffect, useRef, useState } from 'react';
import '../../web/assets/home.css';
import { createRpc } from '../../web/assets/rpc.js';
import { liveCounter, pct } from '../../web/assets/census.js';
import { FACTORY } from '../../web/assets/index-view.js';
import { SOURCE } from '../../web/assets/source.js';
import { startMotion } from '../../web/assets/motion.js';
import { drawWaffle } from '../../web/assets/diagrams.js';
import { drawPathScene } from '../../web/assets/iso.js';
import '../../web/assets/iso.css';
import { useFinding, useCensus, headline, usd, usdShort, time, nearShort, pct0, RECORDED } from './lib/finding.js';
const REPO = 'https://github.com/aditi3175/docket';

const TX = (h) => `https://nearblocks.io/txns/${h}`;
const PAGES = [['Overview', 'index.html'], ['Account', 'account.html'], ['Proposals', 'docket.html'], ['Register', 'register.html'], ['Opt out', 'optout.html']];
const known = (o) => Boolean(o) && o !== 'unknown' && o !== 'none';
const valueOf = (r) => (r.slug ? (typeof r.usd === 'number' ? usdShort(r.usd) : 'unknown') : (r.stakedNear ? nearShort(r.stakedNear) : 'unknown'));
const still = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const Id = ({ children }) => <span className="id">{children}</span>;

function KeySvg({ w, h, faint }) {
  return <svg viewBox="0 0 34 80" width={w} height={h} aria-hidden="true" style={faint ? { opacity: 0.3 } : undefined}><use href="#keyshape" /></svg>;
}

// ---------------- copy built from the reads ----------------
function Headline({ of }) {
  const text = headline(of);
  const cut = text.indexOf(', without a vote.');
  if (cut < 0) return <>{text}</>;
  return <>{text.slice(0, cut)}, <span className="novote">without a vote</span>.</>;
}

function Stats({ s }) {
  const r = s.headlineOf;
  const n = s.keys.count;
  const open = s.rows.filter((x) => x.autoUpdate === true).length;
  const stat = (big, small, cls = '') => <div className={`stat ${cls}`.trim()}><b>{big}</b><span>{small}</span></div>;
  return (
    <div className="stats-row">
      {stat(n === null ? 'unknown' : n, n === 1 ? 'key opens it' : 'keys open it', n === null ? 'unknown-text' : '')}
      {stat(typeof r.exposedUsd === 'number' ? pct0(r.exposedUsd, r.lsTotal) : 'unknown', 'of NEAR liquid staking', typeof r.exposedUsd === 'number' ? '' : 'unknown-text')}
      {stat(open ? '0' : 'unknown', open ? 'votes needed' : 'votes needed: unknown', open ? 'novote' : 'unknown-text')}
    </div>
  );
}

function provenance(s) {
  const r = s.headlineOf;
  const money = typeof r.exposedUsd === 'number' ? `${usd(r.exposedUsd)} of ${usd(r.lsTotal)}, NEAR-only TVL` : 'value unknown';
  if (s.failed) return `Unknown: the page failed while reading (${s.failed}). Shown: the values recorded ${time(RECORDED.llamaReadAt)}.`;
  if (s.gaps.length) return `Live reads failed at ${time(s.readAt)}: ${s.gaps.join(', ')}. The headline shows the values recorded ${time(RECORDED.llamaReadAt)} (DefiLlama) and ${RECORDED.chainRecordedOn} (chain).`;
  if (s.recorded) return `Recorded values: DefiLlama ${money}, ${time(RECORDED.llamaReadAt)} · NEAR mainnet, ${RECORDED.chainRecordedOn}. Reading live now…`;
  return `DefiLlama ${money}, read ${time(s.llamaReadAt)} · NEAR mainnet, read ${time(s.readAt)}`;
}

// ---------------- the vault's sequence ----------------
// The log's total is drawn at render time, not frozen when logged: the live value may land after the
// door opens, and until it does the figure is labelled recorded (I1).
const TOTAL = Symbol('total');
const totalLabel = (s) => (typeof s.headlineOf.exposedUsd === 'number' ? `${usdShort(s.headlineOf.exposedUsd)}${s.recorded ? ' (recorded)' : ''}` : 'unknown');
const IDLE = { inK: 0, turned: 0, vote: '', spin: false, jam: false, retract: false, open: false, shake: false, log: [] };
const stamp = () => { const t = new Date(); return `${String(t.getMinutes()).padStart(2, '0')}:${String(t.getSeconds()).padStart(2, '0')}`; };

function useVault(s) {
  const [st, set] = useState(IDLE);
  const timers = useRef([]);
  const latest = useRef(s);
  latest.current = s;
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const run = useCallback((mode) => {
    timers.current.forEach(clearTimeout); timers.current = [];
    const at = (ms, f) => timers.current.push(setTimeout(f, still() ? 0 : ms));
    const patch = (p) => set((x) => ({ ...x, ...p }));
    const log = (...parts) => set((x) => ({ ...x, log: [...x.log, { t: stamp(), parts }].slice(-7) }));
    set({ ...IDLE, log: [] });
    const { keys, rows } = latest.current;
    const n = keys.count;
    if (n === null) { log('factory keys: ', ['unknown', 'unknown-text'], ' · the read failed, so the vault is not animated'); return; }
    log([FACTORY, 'w'], ' · signing with its full-access keys');
    const step = 650;
    for (let i = 0; i < n; i++) {
      at(500 + i * step, () => patch({ inK: i + 1 }));
      at(1050 + i * step, () => { patch({ turned: i + 1 }); log([`key ${i + 1}`, 'novote'], ' turned'); });
    }
    const t0 = 1050 + n * step;
    const owners = rows.map((r) => r.owner).filter(known);
    at(t0, () => log('factory → ', ['update()', 'w'], ` on ${owners.length ? owners.join(', ') : 'the owner DAOs'}`));
    const anyTrue = rows.some((r) => r.autoUpdate === true);
    const allFalse = rows.every((r) => r.autoUpdate === false);
    if (mode === 't' && anyTrue) {
      at(t0 + 500, () => { patch({ vote: 'bypass' }); log('auto_update: ', ['true', 'novote'], ' · proposal: ', ['none', 'novote'], ' · vote: ', ['none', 'novote']); });
      at(t0 + 800, () => patch({ spin: true }));
      at(t0 + 2000, () => { patch({ retract: true }); log('bolts retracted'); });
      at(t0 + 2600, () => patch({ open: true }));
      at(t0 + 3900, () => log(['vault open · ', 'g'], TOTAL, [' · nobody was asked', 'g']));
    } else if (mode === 'f' || allFalse) {
      at(t0 + 500, () => { patch({ vote: 'req' }); log('auto_update: ', ['false', 'optedout'], ' · a DAO proposal is required'); });
      at(t0 + 800, () => patch({ jam: true }));
      at(t0 + 1400, () => { patch({ shake: true }); log(['update rejected', 'optedout'], mode === 'f' ? ' · as in the mainnet test, tx 772n4Z…' : ''); });
      at(t0 + 2400, () => log(['vault stays shut', 'w'], ' · the members decide'));
    } else {
      at(t0 + 500, () => log('auto_update: ', ['unknown', 'unknown-text'], ' · the read failed; the vault is shown shut'));
    }
  }, []);
  return [st, run];
}

const RIVETS = [[4, 4], [96, 4], [4, 96], [96, 96], [50, 3], [50, 97], [3, 50]];
const DOOR_RIVETS = Array.from({ length: 20 }, (_, i) => { const a = (i / 20) * Math.PI * 2; return [50 + Math.cos(a) * 44, 50 + Math.sin(a) * 44]; });
const BOLTS = Array.from({ length: 8 }, (_, i) => i * 45 + 22.5);

function Vault({ s, st, frameRef }) {
  const n = s.keys.count;
  const holes = n === null ? [] : Array.from({ length: n }, (_, i) => { const a = ((-30 + (i * 360) / n) * Math.PI) / 180; return [50 + Math.cos(a) * 34, 50 + Math.sin(a) * 34]; });
  const total = typeof s.headlineOf.exposedUsd === 'number' ? usdShort(s.headlineOf.exposedUsd) : 'unknown';
  const voteText = st.vote === 'bypass' ? 'DAO vote · bypassed' : st.vote === 'req' ? 'DAO vote · required' : 'DAO vote';
  return (
    <div className="stage" role="figure" aria-label="The vault: the value at stake, locked only by the factory's keys">
      <div className="panel">
        {n === null
          ? <div className="led unknown"><i /><span>Keys: unknown</span></div>
          : holes.map((_, i) => <div key={i} className={`led${st.turned > i ? ' on' : ''}`}><i /><span>Key {i + 1}</span></div>)}
        <div className={`led vote${st.vote === 'req' ? ' req blink' : ''}`}><i /><span>{voteText}</span></div>
      </div>

      <div ref={frameRef} className={`frame${st.open ? ' open' : ''}${st.shake ? ' shake' : ''}`}>
        <div className="flash" />
        {RIVETS.map(([x, y]) => <i key={`${x}-${y}`} className="rivet" style={{ left: `${x}%`, top: `${y}%` }} />)}
        <div className="mouth">
          <div className="chamber">
            <div className="boxes">
              {s.rows.map((r) => { const v = valueOf(r); return <div key={r.contract} className={`box${v === 'unknown' ? ' unknown' : ''}`}><small>{r.name}</small><b>{v}</b></div>; })}
            </div>
            <div className="shelf" style={{ top: '36%' }} />
            <div className="total"><b>{total}</b><small>Open. No proposal, no vote.</small></div>
            <div className="bars" aria-hidden="true">
              {[1, 2, 3, 4].map((k) => <div key={k}>{Array.from({ length: k }, (_, j) => <span key={j} className="bar" />)}</div>)}
            </div>
            <div className="shelf" style={{ bottom: '13%' }} />
          </div>
          {BOLTS.map((d) => <div key={d} className="recv" style={{ transform: `rotate(${d}deg)` }}><i /></div>)}
          <div className="door">
            {[4, 8, 12, 16, 20, 24].map((z) => <div key={z} className="thk" style={{ transform: `translateZ(-${z}px)` }} />)}
            <div className={`face${st.spin ? ' spin' : ''}${st.jam ? ' jam' : ''}${st.retract ? ' retract' : ''}`}>
              <div className="wheel">
                <svg viewBox="-100 -100 200 200" aria-hidden="true">
                  <defs>
                    <linearGradient id="st" gradientUnits="userSpaceOnUse" x1="-100" y1="-100" x2="100" y2="100"><stop offset="0" stopColor="#F6F0F4" /><stop offset=".5" stopColor="#9E8E99" /><stop offset="1" stopColor="#4C3D48" /></linearGradient>
                    <radialGradient id="hub" cx=".35" cy=".3"><stop offset="0" stopColor="#F8F2F6" /><stop offset=".6" stopColor="#928290" /><stop offset="1" stopColor="#3B2F38" /></radialGradient>
                  </defs>
                  <circle r="78" fill="none" stroke="url(#st)" strokeWidth="9" />
                  <g stroke="url(#st)" strokeWidth="10" strokeLinecap="round"><line x1="0" y1="0" x2="0" y2="-96" /><line x1="0" y1="0" x2="83" y2="48" /><line x1="0" y1="0" x2="-83" y2="48" /></g>
                  <circle cx="0" cy="-98" r="11" fill="url(#hub)" /><circle cx="85" cy="49" r="11" fill="url(#hub)" /><circle cx="-85" cy="49" r="11" fill="url(#hub)" />
                  <circle r="26" fill="url(#hub)" /><circle r="9" fill="#2a2b30" />
                </svg>
              </div>
              {DOOR_RIVETS.map(([x, y]) => <i key={`${x}-${y}`} className="drivet" style={{ left: `${x}%`, top: `${y}%` }} />)}
              {BOLTS.map((d) => <div key={d} className="bolt" style={{ transform: `rotate(${d}deg)` }}><i /></div>)}
              {n === null
                ? <div className="kh unknown" style={{ left: '50%', top: '16%' }}><div className="plate" /><div className="lbl">keys: unknown</div></div>
                : holes.map(([x, y], i) => (
                  <div key={i} className="kh" style={{ left: `${x}%`, top: `${y}%` }}>
                    <div className="plate" /><div className="slot" /><div className="lbl">key {i + 1}</div>
                    <div className={`key${st.inK > i ? ' in' : ''}${st.turned > i ? ' turn' : ''}`}><KeySvg /></div>
                  </div>
                ))}
            </div>
          </div>
        </div>
        <div className="hinge" style={{ top: '24%' }} /><div className="hinge" style={{ bottom: '24%' }} />
      </div>

      <div className="readout" aria-live="polite">
        {st.log.map((row, i) => (
          <div key={`${row.t}-${i}-${st.log.length}`}>
            <span className="t">{row.t}</span>
            {row.parts.map((p, j) => (p === TOTAL ? <span key={j} className="g">{totalLabel(s)}</span> : typeof p === 'string' ? <span key={j}>{p}</span> : <span key={j} className={p[1]}>{p[0]}</span>))}
          </div>
        ))}
      </div>
    </div>
  );
}

function Hero({ s }) {
  const [st, run] = useVault(s);
  const [mode, setMode] = useState('t');
  const frameRef = useRef(null);
  useEffect(() => {
    const f = frameRef.current; if (!f || typeof IntersectionObserver !== 'function') { run('t'); return undefined; }
    const o = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { run('t'); o.disconnect(); } }, { threshold: 0.25 });
    o.observe(f);
    return () => o.disconnect();
  }, [run]);
  const pick = (m) => { setMode(m); run(m); };
  const live = !s.recorded && !s.gaps.length && !s.failed;
  return (
    <div className="hero"><div className="wrap">
      <div className="hero-text">
        <div className="eyebrow">Docket · read from the chain alone</div>
        <h1><Headline of={s.headlineOf} /></h1>
        <Stats s={s} />
        <p className={`prov${live ? ' live' : ''}`} aria-live="polite"><i /><span>{provenance(s)}</span></p>
        <div className="modes" role="group" aria-label="Replay the vault">
          <button type="button" className="t" aria-pressed={mode === 't'} onClick={() => pick('t')}><span>auto_update: true</span><small>how it reads today</small></button>
          <button type="button" className="f" aria-pressed={mode === 'f'} onClick={() => pick('f')}><span>auto_update: false</span><small>after one proposal</small></button>
        </div>
        <div className="cta">
          <button type="button" className="btn gold" onClick={() => run(mode)}>Turn the keys ↻</button>
          <a className="btn" href="optout.html?dao=stnear.sputnik-dao.near">Add the fourth lock →</a>
        </div>
      </div>
      <Vault s={s} st={st} frameRef={frameRef} />
    </div></div>
  );
}

// ---------------- 01 the story, in 3D (iso.js) ----------------
// Keys -> factory -> each DAO -> each deposit. The labels are the reads: the key count, each DAO's
// auto_update and each deposit's value (or "unknown").
function Story({ s }) {
  const ref = useRef(null);
  const model = { keys: s.keys.count, rows: s.rows.map((x) => ({ name: x.name, dao: x.owner, value: valueOf(x), au: x.autoUpdate })) };
  const key = JSON.stringify(model);
  useEffect(() => { if (ref.current) drawPathScene(ref.current, model); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const open = s.rows.some((x) => x.autoUpdate === true);
  return (
    <section className="s" id="story"><div className="wrap">
      <div className="sh"><div className="n">01 · How</div><div>
        <h2>One key turns, <span className="novote">no one votes</span>, the code is replaced.</h2>
      </div></div>
      <div ref={ref} className="story-scene" />
      <ol className="story-steps">
        <li><b>1</b><span>A factory key signs.</span></li>
        <li><b>2</b><span><Id>update()</Id> runs. <a href={SOURCE.updateAssert.href}>Not a proposal.</a></span></li>
        <li className={open ? "novote" : ""}><b>3</b><span className={open ? "novote" : ""}>{open ? 'The DAO\u2019s code is replaced. No vote.' : 'The update stops at the vote.'}</span></li>
      </ol>
    </div></section>
  );
}

// The census as three blocks, one square per DAO (diagrams.js). I20: the records and the counts are the
// same graph.json census; the chain recount stays on the reader's click.
function Waffle({ records, counts }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) drawWaffle(ref.current, records, counts); }, [records, counts]);
  return <div ref={ref} />;
}

function Doors({ c }) {
  const [live, setLive] = useState(null);
  const [busy, setBusy] = useState(false);
  const recount = async () => {
    setBusy(true); setLive('Reading the DAO list from the factory…');
    const r = await liveCounter(createRpc(), { onProgress: ({ done, total, counts }) => setLive(`${counts.false} opted out so far · ${done} of ${total} DAOs read`) });
    setLive(r.status !== 'ok' ? `Unknown: ${r.reason}` : `Recounted from the chain (${time(r.readAt)}): ${r.counts.false} of ${r.denominator} read false, ${r.counts.true} true, ${r.counts['no-factory-info']} no get_factory_info, ${r.counts.unread} unread.`);
    setBusy(false);
  };
  const ok = c.status === 'ok';
  const k = ok ? c.c.counts : null;
  const fmt = (n) => n.toLocaleString('en-US');
  return (
    <section className="s" id="doors"><div className="wrap">
      <div className="sh"><div className="n">02 · How many</div><div>
        <h2>{ok ? <>This is not one vault. <span className="novote">{fmt(k.true)} of {fmt(c.c.denominator)}</span> DAOs have the same lock.</> : 'Most DAOs on the factory have the same lock.'}</h2>
      </div></div>
      {ok ? <Waffle records={c.records} counts={k} /> : <p className="unknown-text">{c.status === 'reading' ? 'Reading the census…' : `Census unknown: ${c.reason}`}</p>}
      <div className="census-foot">
        <span>{ok ? `${pct(c.c.shareTrueOfAnswered)} of the ${fmt(c.c.answered)} that answered read auto_update: true. Census ${c.when?.slice(0, 10) ?? 'undated'}${c.complete ? '' : ', incomplete'}.` : 'The census is computed from graph.json’s records.'}</span>
        <a href="register.html">Every DAO in the register →</a>
        <button type="button" className="btn" onClick={recount} disabled={busy}>Recount from the chain now (about 15 minutes)</button>
        {live && <span className="census-live" aria-live="polite">{live}</span>}
      </div>
    </div></section>
  );
}

// ---------------- 04 the fourth lock ----------------
function Fix({ badge }) {
  const word = !badge ? 'Reading the factory…' : { 'not-shipped': 'Not shipped', 'factory-changed': 'The factory has changed', unknown: 'Unknown' }[badge.state] ?? 'Unknown';
  const unknown = !badge || badge.state === 'unknown';
  return (
    <section className="s" id="fix"><div className="wrap">
      <div className="sh"><div className="n">03 · The fix</div><div>
        <h2>A fix exists and is not deployed. <span className="optedout">One proposal</span> fits the lock today.</h2>
      </div></div>
      <div className="cards">
        <article className="card"><div className="tag">The factory fix</div>
          <h3 className={unknown ? 'unknown-text' : ''}><i />{word}</h3>
          <p>{badge ? (badge.state === 'not-shipped' ? 'The factory still deploys the old code.' : badge.text.replace(/^Fix shipped\? (No\. )?/, '')) : 'Read live from the factory.'}</p>
          <div className="ev"><a href="https://github.com/near-daos/sputnik-dao-contract/pull/233">PR #233, merged 2026-03-24</a><span className="muted">{badge ? (badge.state === 'unknown' ? `Factory read failed: ${badge.detail}` : `Factory read ${time(badge.readAt)}`) : 'Factory read: pending'}</span></div>
        </article>
        <article className="card lock"><div className="tag">Fit it yourself</div>
          <svg className="padlock" viewBox="0 0 64 72" aria-hidden="true"><path d="M18 32V22a14 14 0 0 1 28 0v10" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" /><rect x="8" y="30" width="48" height="38" rx="10" fill="currentColor" /><circle cx="32" cy="46" r="5" fill="#120e1c" /><rect x="29.5" y="48" width="5" height="10" rx="2" fill="#120e1c" /></svg>
          <h3>1 proposal</h3>
          <p>Set <Id>auto_update</Id> to false. Tested on mainnet.</p>
          <div className="ev">
            <a href="optout.html?dao=stnear.sputnik-dao.near">Draft it for <Id>stnear.sputnik-dao.near</Id> →</a>
            <a href={TX('772n4ZWMRtmXwsWuVTSP5F1UkbZ27UNyM9SqVzgXnXFS')}>Rejected, opted out</a>
            <a href={TX('EZw51V5kCMeCCMsmNw5WqDsSUK8R2CHs4WyeK4jTtB1b')}>Ran, not opted out</a>
          </div>
        </article>
        <article className="card"><div className="tag">A delegate that can’t overreach</div>
          <h3>Approved 1, refused 1</h3>
          <p>An AI voter with one narrow key. It refused the trap.</p>
          <div className="ev">
            <a href={TX('HnMopqHKJaJ7jJNY4sWkHoYJH6TLwZnVFmNzPh9ur6wZ')}>Its approval of #7</a>
            <a href={`${REPO}/blob/master/agent/log/docket-demo.sputnik-dao.near-8.json`}>Its refusal of #8, with the report</a>
          </div>
        </article>
      </div>
    </div></section>
  );
}

export default function Home() {
  const s = useFinding();
  const c = useCensus();
  useEffect(() => startMotion(), []); // sections rise into view (presentation only; off for reduced motion)
  const censusLine = c.status === 'ok' ? `Census ${c.when?.slice(0, 10)}${c.complete ? '' : ' (incomplete)'}: ${c.c.denominator.toLocaleString('en-US')} DAOs` : c.status === 'reading' ? 'Census: reading graph.json…' : 'Census: unknown (graph.json unread)';
  return (
    <>
      <a className="skip" href="#main">Skip to the finding</a>
      <header className="top"><div className="wrap">
        <a className="logo" href="index.html" aria-label="Docket, overview"><i />Docket</a>
        <nav aria-label="Pages">{PAGES.map(([label, href]) => <a key={href} href={href} aria-current={label === 'Overview' ? 'page' : undefined}>{label}</a>)}</nav>
      </div></header>

      <main id="main">
        <Hero s={s} />
        <Story s={s} />
        <Doors c={c} />
        <Fix badge={s.badge} />
      </main>

      <footer><div className="wrap">
        <a href={REPO}>github.com/aditi3175/docket</a>
        <span>Read live from NEAR mainnet and DefiLlama. A failed read shows "unknown".</span>
        <span>{censusLine}</span>
      </div></footer>

      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true"><defs>
        <linearGradient id="kg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#9A8994" /><stop offset=".5" stopColor="#5F4D5A" /><stop offset="1" stopColor="#2F232C" /></linearGradient>
        <g id="keyshape"><circle cx="17" cy="14" r="12" fill="none" stroke="url(#kg)" strokeWidth="6" /><rect x="14" y="25" width="6" height="52" rx="2" fill="url(#kg)" /><rect x="20" y="58" width="9" height="5" fill="url(#kg)" /><rect x="20" y="68" width="6" height="5" fill="url(#kg)" /></g>
      </defs></svg>
    </>
  );
}

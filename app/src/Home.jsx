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
import { FACTORY, countWord } from '../../web/assets/index-view.js';
import { SOURCE } from '../../web/assets/source.js';
import { startMotion } from '../../web/assets/motion.js';
import { drawWaffle } from '../../web/assets/diagrams.js';
import { useFinding, useCensus, usd, usdShort, time, nearShort, pct0, RECORDED } from './lib/finding.js';
const REPO = 'https://github.com/aditi3175/docket';

const TX = (h) => `https://nearblocks.io/txns/${h}`;
const PR = 'https://github.com/near-daos/sputnik-dao-contract/pull/233';
// The mainnet opt-out test on docket-demo.sputnik-dao.near (ARCHITECTURE.md §16.5): the same factory
// update twice, only auto_update changed between them.
const TX_TRUE = 'EZw51V5kCMeCCMsmNw5WqDsSUK8R2CHs4WyeK4jTtB1b'; // step 9, auto_update: true, update ran
const TX_FALSE = '772n4ZWMRtmXwsWuVTSP5F1UkbZ27UNyM9SqVzgXnXFS'; // step 5, auto_update: false, rejected
const PAGES = [['Overview', 'index.html'], ['Account', 'account.html'], ['Proposals', 'docket.html'], ['Register', 'register.html'], ['Opt out', 'optout.html']];
const known = (o) => Boolean(o) && o !== 'unknown' && o !== 'none';
const auKind = (a) => (a === true ? 'novote' : a === false ? 'optedout' : 'unknown');
const valueOf = (r) => (r.slug ? (typeof r.usd === 'number' ? usdShort(r.usd) : 'unknown') : (r.stakedNear ? nearShort(r.stakedNear) : 'unknown'));
const still = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const Id = ({ children }) => <span className="id">{children}</span>;

function KeySvg({ w, h, faint }) {
  return <svg viewBox="0 0 34 80" width={w} height={h} aria-hidden="true" style={faint ? { opacity: 0.3 } : undefined}><use href="#keyshape" /></svg>;
}

// ---------------- copy built from the reads ----------------
// One sentence. The key count and the dollar figure are reads (recorded first, labelled below); an
// unknown read says unknown (I2). The figure is the same one everywhere: Meta Pool + LiNEAR, the
// DefiLlama-valued protocols whose DAO reads auto_update: true (index-view.js).
function Headline({ s }) {
  const n = s.keys.count; const x = s.headlineOf.exposedUsd;
  const w = n === null ? null : countWord(n);
  const who = w === null ? 'The factory’s keys (how many is unknown)' : `${w[0].toUpperCase()}${w.slice(1)} key${n === 1 ? '' : 's'}`;
  return <>{who} can replace the code behind {typeof x === 'number' ? usdShort(x) : 'an unknown amount'} of NEAR liquid staking. <span className="novote">No vote needed.</span></>;
}

// I19: "never been deployed" is said only while the live factory read says so.
function FixLine({ badge }) {
  const tail = !badge ? <>Whether it is deployed: reading the factory…</>
    : badge.state === 'not-shipped' ? <><a href="#fix">The fix isn’t deployed (checked live).</a></>
      : badge.state === 'factory-changed' ? <><a href="#fix">The factory has changed since; check what it deploys.</a></>
        : <span className="unknown-text">Whether it is deployed: unknown.</span>;
  return <p className="fixline">Sputnik’s maintainers fixed this in <a href={PR}>PR #233</a> on 24 Mar 2026. {tail}</p>;
}

function provenance(s) {
  if (s.failed) return `Unknown: the read failed (${s.failed}). Shown: recorded ${time(RECORDED.llamaReadAt)}.`;
  if (s.gaps.length) return `Live reads failed (${s.gaps.join(', ')}). Shown: recorded ${time(RECORDED.llamaReadAt)}.`;
  if (s.recorded) return `Recorded ${time(RECORDED.llamaReadAt)} · reading NEAR mainnet live…`;
  return `Read live from NEAR mainnet, ${time(s.readAt)}.`;
}

// The exact figures, small print in section 02 (I1: each with its source and time).
function exact(s) {
  const r = s.headlineOf;
  const money = typeof r.exposedUsd === 'number' ? `${usd(r.exposedUsd)} of ${typeof r.lsTotal === 'number' ? usd(r.lsTotal) : 'unknown'}` : 'unknown';
  const llama = s.recorded || s.gaps.length || s.failed ? `recorded ${time(RECORDED.llamaReadAt)}` : `read ${time(s.llamaReadAt)}`;
  const nx = s.rows.find((x) => !x.slug);
  const nearx = nx ? `, plus ${nx.name}: ${valueOf(nx) === 'unknown' ? 'staked NEAR unknown' : `${valueOf(nx)} staked`} (DefiLlama doesn’t value it)` : '';
  return `Meta Pool + LiNEAR, NEAR-only TVL (DefiLlama): ${money} NEAR liquid staking, ${llama}${nearx}.`;
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
  const run = useCallback(() => {
    timers.current.forEach(clearTimeout); timers.current = [];
    const at = (ms, f) => timers.current.push(setTimeout(f, still() ? 0 : ms));
    const patch = (p) => set((x) => ({ ...x, ...p }));
    const log = (...parts) => set((x) => ({ ...x, log: [...x.log, { t: stamp(), parts }].slice(-5) }));
    set({ ...IDLE, log: [] });
    const { keys, rows } = latest.current;
    const n = keys.count;
    if (n === null) { log('factory keys: ', ['unknown', 'unknown-text'], ' · the read failed, so the vault is not animated'); return; }
    log([FACTORY, 'w'], ` · signing with ${n} full-access key${n === 1 ? '' : 's'}`);
    const step = 650;
    for (let i = 0; i < n; i++) {
      at(500 + i * step, () => patch({ inK: i + 1 }));
      at(1050 + i * step, () => { patch({ turned: i + 1 }); if (i === n - 1) log([n === 1 ? 'key 1' : `keys 1–${n}`, 'novote'], ' turned'); });
    }
    const t0 = 1050 + n * step;
    const owners = rows.map((r) => r.owner).filter(known);
    at(t0, () => log('factory → ', ['update()', 'w'], ` on ${owners.length ? `${owners.length} owner DAO${owners.length === 1 ? '' : 's'}` : 'the owner DAOs'}`));
    const anyTrue = rows.some((r) => r.autoUpdate === true);
    const allFalse = rows.every((r) => r.autoUpdate === false);
    if (anyTrue) {
      at(t0 + 500, () => { patch({ vote: 'bypass' }); log('auto_update: ', ['true', 'novote'], ' · proposal: ', ['none', 'novote'], ' · vote: ', ['none', 'novote']); });
      at(t0 + 800, () => patch({ spin: true }));
      at(t0 + 2000, () => patch({ retract: true }));
      at(t0 + 2600, () => patch({ open: true }));
      at(t0 + 3900, () => log(['vault open · ', 'g'], TOTAL, [' · nobody was asked', 'g']));
    } else if (allFalse) {
      at(t0 + 500, () => { patch({ vote: 'req' }); log('auto_update: ', ['false', 'optedout'], ' · proposal required'); });
      at(t0 + 800, () => patch({ jam: true }));
      at(t0 + 1400, () => { patch({ shake: true }); log(['update rejected', 'optedout']); });
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
  const frameRef = useRef(null);
  useEffect(() => {
    const f = frameRef.current; if (!f || typeof IntersectionObserver !== 'function') { run(); return undefined; }
    const o = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { run(); o.disconnect(); } }, { threshold: 0.25 });
    o.observe(f);
    return () => o.disconnect();
  }, [run]);
  const live = !s.recorded && !s.gaps.length && !s.failed;
  return (
    <div className="hero"><div className="wrap">
      <div className="hero-text">
        <div className="eyebrow">Docket · read from the chain alone</div>
        <h1><Headline s={s} /></h1>
        <p className="plain">These protocols are run by Sputnik DAOs. The “factory” that created those DAOs can still swap their code, unless a DAO switches it off.</p>
        <FixLine badge={s.badge} />
        <div className="cta">
          <a className="btn gold" href="account.html">Check an account →</a>
          <a className="btn" href="#proof">See the proof ↓</a>
        </div>
        <p className={`prov${live ? ' live' : ''}`} aria-live="polite"><i /><span>{provenance(s)} Check it yourself: <a href={REPO}><code>node tools/verify.mjs</code></a></span></p>
      </div>
      <Vault s={s} st={st} frameRef={frameRef} />
    </div></div>
  );
}

// ---------------- 01 the proof: the same update, two endings ----------------
// The mainnet opt-out test (§16.5) on docket-demo.sputnik-dao.near: the same receipt
// sputnik-dao.near → docket-demo.sputnik-dao.near update(), with only auto_update changed. Each lane
// links its transaction. Motion: the steps light up in order when the lanes scroll into view, then a
// dot runs the path (to the end with true; to the ✕ with false). Off under prefers-reduced-motion.
function Story() {
  const ref = useRef(null);
  const [play, setPlay] = useState(false);
  useEffect(() => {
    const e = ref.current; if (!e || typeof IntersectionObserver !== 'function') { setPlay(true); return undefined; }
    const o = new IntersectionObserver((es) => { if (es.some((x) => x.isIntersecting)) { setPlay(true); o.disconnect(); } }, { threshold: 0.35 });
    o.observe(e); return () => o.disconnect();
  }, []);
  const node = (i, icon, label, dim) => <li className={`n${dim ? ' dim' : ''}`} style={{ '--i': i }}><svg aria-hidden="true"><use href={`#${icon}`} /></svg><b>{label}</b></li>;
  const arrow = (i, cls = '') => <li className={`a ${cls}`.trim()} style={{ '--i': i }} aria-hidden="true"><em /></li>;
  return (
    <section className="s" id="proof"><div className="wrap">
      <div className="sh"><div className="n">01 · The proof</div><div>
        <h2>Same keys. <span className="novote">Different ending.</span></h2>
        <p>The same factory <Id>update()</Id> reached our test DAO twice. Only <Id>auto_update</Id> changed.</p>
      </div></div>
      <div ref={ref} className={`ends${play ? ' play' : ''}`}>
        <div className="end novote">
          <h3>auto_update: true</h3>
          <small>step 9 · the default</small>
          <ol className="chain" aria-label="auto_update true: the factory's update replaced the DAO's code">
            {node(0, 'i-factory', 'sputnik-dao.near')}{arrow(1)}{node(2, 'i-dao', 'docket-demo')}{arrow(3)}{node(4, 'i-code', 'its code')}
          </ol>
          <div className="end-out" style={{ '--i': 5 }}><b>Replaced.</b><span>The factory's <Id>update()</Id> went through. · <a href={TX(TX_TRUE)}>EZw51V5k… on nearblocks</a></span></div>
        </div>
        <div className="end optedout">
          <h3>auto_update: false</h3>
          <small>step 5 · after one proposal</small>
          <ol className="chain" aria-label="auto_update false: the factory's update was rejected at the DAO">
            {node(0, 'i-factory', 'sputnik-dao.near')}{arrow(1, 'stop')}{node(2, 'i-dao-v', 'docket-demo')}{arrow(3, 'dim')}{node(4, 'i-code', 'its code', true)}
          </ol>
          <div className="end-out" style={{ '--i': 5 }}><b>Rejected:</b><span><Id>ERR_MUST_BE_SELF_OR_FACTORY</Id>. A vote is now required. · <a href={TX(TX_FALSE)}>772n4ZWM… on nearblocks</a></span></div>
        </div>
      </div>
      <p className="proof-note">This shows the switch works. The no-vote path itself comes from the contract source and live reads: the factory's <Id>update()</Id> is not a proposal. <a href={SOURCE.updateAssert.href}>upgrade.rs lines 117–128</a></p>
      <p className="why-line"><b>Who holds the keys?</b> Docket can’t see who holds them. The risk isn’t the maintainers; it’s that three keys are a single point of failure. PR #233’s own title says the fix is “to counter the risk of taking control if the factory account is compromised.” <a href={PR}>PR #233</a></p>
      <p className="why-line"><b>Why it exists:</b> <Id>auto_update</Id> lets the factory rescue a broken DAO. The problem is that nobody downstream can see it, and NEAR’s own fix isn’t deployed.</p>
    </div></section>
  );
}

// ---------------- 01 deposits ----------------
function Deposits({ s }) {
  const r = s.headlineOf;
  const valued = s.rows.filter((x) => x.slug && x.autoUpdate === true && typeof x.usd === 'number');
  const ok = typeof r.lsTotal === 'number' && typeof r.exposedUsd === 'number';
  const nx = s.rows.find((x) => !x.slug);
  return (
    <section className="s" id="inside"><div className="wrap">
      <div className="sh"><div className="n">02 · Inside the vault</div><div>
        <h2>Each deposit is owned by a DAO the factory can upgrade <span className="novote">without a vote</span>.</h2>
        <p>Each protocol's contract is owned by a Sputnik DAO. Each card shows that DAO's <Id>auto_update</Id>.</p>
      </div></div>
      <div className="deposits">
        {s.rows.map((x, i) => {
          const v = valueOf(x); const k = auKind(x.autoUpdate);
          const src = x.slug ? (typeof x.usd === 'number' ? 'NEAR-only TVL, DefiLlama' : 'value unknown: DefiLlama unread') : (x.stakedNear ? 'staked NEAR, read on chain' : `staked balance unknown${x.stakedUnknown ? `: ${x.stakedUnknown}` : ''}`);
          return (
            <article key={x.contract} className="dep">
              <div className="tag">Deposit 0{i + 1} · {x.name}</div>
              <div className={`amt${v === 'unknown' ? ' unknown-text' : ''}`}>{v}</div>
              <div className="src">{src}</div>
              <dl>
                <dt>contract</dt><dd><a className="id" href={`account.html?account=${encodeURIComponent(x.contract)}`}>{x.contract}</a></dd>
                <dt>owner</dt><dd>{known(x.owner) ? <a className="id" href={`docket.html?dao=${encodeURIComponent(x.owner)}`}>{x.owner}</a> : <span className="unknown-text">owner {x.owner ?? 'unknown'}</span>}</dd>
                <dt>auto_update</dt><dd><span className={`id ${k === 'unknown' ? 'unknown-text' : k}`}>{String(x.autoUpdate)}</span></dd>
              </dl>
              <span className={`pill ${k === 'unknown' ? 'unknown-text' : k}`}>{k === 'novote' ? '● no vote needed' : k === 'optedout' ? '● opted out' : '● auto_update unknown'}</span>
            </article>
          );
        })}
      </div>
      <div className="share" aria-hidden="true">
        {ok && valued.map((x) => <i key={x.contract} style={{ width: `${(100 * x.usd) / r.lsTotal}%` }}><span><b>{x.name}</b> {usdShort(x.usd)}</span></i>)}
        {ok && <b className="rest"><span>rest<em> of NEAR liquid staking</em></span></b>}
      </div>
      <div className="share-l">
        <span>{ok ? `${valued.map((x) => x.name).join(' + ')} = ${pct0(r.exposedUsd, r.lsTotal)} of ${usdShort(r.lsTotal)} NEAR liquid staking (DefiLlama, NEAR-only TVL)` : 'Share of NEAR liquid staking: unknown'}</span>
        <span>{nx ? `plus ${nx.name}: ${valueOf(nx) === 'unknown' ? 'staked NEAR unknown' : `${valueOf(nx)} staked`} (DefiLlama doesn’t value it)` : ''}</span>
      </div>
      <p className="fine">{exact(s)}</p>
    </div></section>
  );
}

// ---------------- 02 keys ----------------
function Keys({ s }) {
  const n = s.keys.count; const r0 = s.rows[0]; const k0 = auKind(r0.autoUpdate);
  const steps = [
    <>A key signs for <b className="id">{FACTORY}</b>.</>,
    <>The factory calls <b>update()</b> on {known(r0.owner) ? <Id>{r0.owner}</Id> : <span className="unknown-text">the owner (unknown)</span>}.</>,
    <>The DAO checks <b>auto_update</b>. It reads <span className={k0 === 'unknown' ? 'unknown-text' : k0}>{String(r0.autoUpdate)}</span>.</>,
    r0.autoUpdate === true ? <>The DAO’s code is replaced. <span className="novote">Proposal: none. Vote: none.</span></>
      : r0.autoUpdate === false ? <>The update is rejected. <span className="optedout">A proposal is required.</span></>
        : <>Whether a vote is needed is <span className="unknown-text">unknown</span>.</>,
    <>The DAO owns <b className="id">{r0.contract}</b> and its {valueOf(r0)}.</>,
  ];
  return (
    <section className="s" id="keys"><div className="wrap">
      <div className="sh"><div className="n">03 · Who holds the keys</div><div>
        <h2>The factory's full-access keys open every one. <span className="novote">The DAO's vote is not a lock.</span></h2>
        <p>With <Id>auto_update: true</Id>, the factory's <Id>update()</Id> replaces a DAO's code. No proposal is created, so members have nothing to vote on.</p>
      </div></div>
      <div className="keys">
        <div className="keyring">
          <div className="ring"><i /><span>keyring of <Id>{FACTORY}</Id></span></div>
          {n === null
            ? <div className="krow missing"><KeySvg w={22} h={48} /><div><b>Factory keys</b><small>the read failed</small></div><span className="st">unknown</span></div>
            : Array.from({ length: n }, (_, i) => (
              <div key={i} className="krow"><KeySvg w={22} h={48} /><div><b>Key {i + 1}</b><small>full access · <Id>{FACTORY}</Id></small></div><span className="st novote">{s.keys.state === 'live' ? 'read live' : 'recorded'}</span></div>
            ))}
          <div className="krow missing"><KeySvg w={22} h={48} faint /><div><b>DAO vote</b><small>a proposal the members approve</small></div><span className="st">not a lock</span></div>
        </div>
        <div className="flow">
          {steps.map((x, i) => <div key={i} className="step"><span>{i + 1}</span><div>{x}</div></div>)}
        </div>
      </div>
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
      <div className="sh"><div className="n">04 · Every door like this one</div><div>
        <h2>{ok ? <>This is not one vault. <span className="novote">{fmt(k.true)} of {fmt(c.c.denominator)}</span> DAOs have the same lock.</> : 'Most DAOs on the factory have the same lock.'}</h2>
        <p>One square per DAO created by <Id>{FACTORY}</Id>, from our scan of all DAOs (dated). Click a square to read its proposals.</p>
      </div></div>
      {ok ? <Waffle records={c.records} counts={k} /> : <p className="unknown-text">{c.status === 'reading' ? 'Reading our scan of all DAOs…' : `Our scan of all DAOs: unknown (${c.reason})`}</p>}
      <div className="census-foot">
        <span>{ok ? `${pct(c.c.shareTrueOfAnswered)} of the ${fmt(c.c.answered)} that answered read auto_update: true. Our scan of all DAOs, ${c.when?.slice(0, 10) ?? 'undated'}${c.complete ? '' : ', incomplete'}.` : 'The counts come from our scan of all DAOs.'}</span>
        <a href="register.html">Every DAO in the register →</a>
        <button type="button" className="btn" onClick={recount} disabled={busy}>Recount from the chain now (about 15 minutes)</button>
        {live && <span className="census-live" aria-live="polite">{live}</span>}
      </div>
    </div></section>
  );
}

// ---------------- 05 the fourth lock ----------------
// I19: the first card's state is the live read of the factory, never a stored value; the build on the
// timeline is named only when that read says the factory still deploys it.
function Fix({ badge }) {
  const word = !badge ? 'Reading the factory…' : { 'not-shipped': 'Not shipped', 'factory-changed': 'The factory has changed', unknown: 'Unknown' }[badge.state] ?? 'Unknown';
  const unknown = !badge || badge.state === 'unknown';
  const shipped = badge?.state === 'not-shipped';
  return (
    <section className="s" id="fix"><div className="wrap">
      <div className="sh"><div className="n">05 · The fourth lock</div><div>
        <h2>A fix exists and is not deployed. <span className="optedout">One proposal</span> fits the lock today.</h2>
      </div></div>
      <div className="cards">
        <article className="card"><div className="tag">The factory fix</div>
          <h3 className={unknown ? 'unknown-text' : ''}><i />{word}</h3>
          <ol className="ftl" aria-label="The factory's default build, then the fix">
            <li className={shipped ? 'on' : 'unk'}><b>{shipped ? 'v3.2 · 2b0f34a' : 'unknown'}</b><span>what the factory deploys</span></li>
            <li className="fix"><b>PR #233</b><span>the fix · not deployed</span></li>
          </ol>
          <div className="ev"><a href="https://github.com/near-daos/sputnik-dao-contract/pull/233">PR #233, merged 2026-03-24</a><span className="muted">{badge ? (badge.state === 'unknown' ? `Factory read failed: ${badge.detail}` : `Factory read ${time(badge.readAt)}`) : 'Factory read: pending'}</span></div>
        </article>
        <article className="card lock"><div className="tag">Fit it yourself</div>
          <svg className="padlock" viewBox="0 0 64 72" aria-hidden="true"><path d="M18 32V22a14 14 0 0 1 28 0v10" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" /><rect x="8" y="30" width="48" height="38" rx="10" fill="currentColor" /><circle cx="32" cy="46" r="5" fill="#120e1c" /><rect x="29.5" y="48" width="5" height="10" rx="2" fill="#120e1c" /></svg>
          <h3>1 proposal</h3>
          <p>Set <Id>auto_update</Id> to false. Tested on mainnet:</p>
          <div className="chips2">
            <a className="chip2 optedout" href={TX('772n4ZWMRtmXwsWuVTSP5F1UkbZ27UNyM9SqVzgXnXFS')}><b>false</b><span>factory update rejected</span></a>
            <a className="chip2 novote" href={TX('EZw51V5kCMeCCMsmNw5WqDsSUK8R2CHs4WyeK4jTtB1b')}><b>true</b><span>factory update ran</span></a>
          </div>
          <div className="ev"><a href="optout.html?dao=stnear.sputnik-dao.near">Draft it for <Id>stnear.sputnik-dao.near</Id> →</a></div>
        </article>
        <article className="card"><div className="tag">A delegate that can’t overreach</div>
          <h3>Approved 1, refused 1</h3>
          <p>An AI voter whose only key can vote on one DAO.</p>
          <div className="chips2">
            <a className="chip2" href={TX('HnMopqHKJaJ7jJNY4sWkHoYJH6TLwZnVFmNzPh9ur6wZ')}><b>#7 ✓</b><span>clean: approved</span></a>
            <a className="chip2" href={`${REPO}/blob/master/agent/log/docket-demo.sputnik-dao.near-8.json`}><b>#8 ✕</b><span>3 flags: sent to a human</span></a>
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
  const censusLine = c.status === 'ok' ? `Our scan of all DAOs (${c.when?.slice(0, 10)}${c.complete ? '' : ', incomplete'}): ${c.c.denominator.toLocaleString('en-US')} DAOs` : c.status === 'reading' ? 'Our scan of all DAOs: loading…' : 'Our scan of all DAOs: unknown (could not be loaded)';
  return (
    <>
      <a className="skip" href="#main">Skip to the finding</a>
      <header className="top"><div className="wrap">
        <a className="logo" href="index.html" aria-label="Docket, overview"><i />Docket</a>
        <nav aria-label="Pages">{PAGES.map(([label, href]) => <a key={href} href={href} aria-current={label === 'Overview' ? 'page' : undefined}>{label}</a>)}</nav>
      </div></header>

      <main id="main">
        <Hero s={s} />
        <Story />
        <Deposits s={s} />
        <Keys s={s} />
        <Doors c={c} />
        <Fix badge={s.badge} />
        <section className="s" id="why"><div className="wrap why2">
          <div className="codecard">
            <h2>Why the vote can be skipped</h2>
            <pre aria-label="The check in update(), from the Sputnik contract"><code><span className="c-k">assert!</span>({'\n'}{'    '}predecessor == this DAO{'\n'}<span className="c-hl">{'    '}|| (predecessor == factory_id && auto_update)</span>{'\n'});</code></pre>
            <div className="pins"><span className="pin novote">the factory: no vote needed</span><span className="pin novote">auto_update: true by default</span></div>
            <p className="srcs"><a href={SOURCE.updateAssert.href}>upgrade.rs 117–128</a><a href={SOURCE.defaultTrue.href}>upgrade.rs 94–100</a></p>
          </div>
          <div className="promises">
            <h2>What these numbers are</h2>
            <ul>
              <li><svg viewBox="0 0 40 40" aria-hidden="true"><rect x="4" y="7" width="32" height="24" rx="3" fill="none" stroke="currentColor" strokeWidth="3" /><path d="M14 36h12M20 31v5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /><circle cx="20" cy="19" r="4" fill="currentColor" /></svg><div><b>Read live</b><span>by your browser, from NEAR mainnet and DefiLlama</span></div></li>
              <li><svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="15" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="5 4" /><path d="M15.5 15.5a4.5 4.5 0 1 1 6 4.2c-1.2.5-1.5 1.3-1.5 2.8M20 27v.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg><div><b>“unknown”, never 0</b><span>when a read fails</span></div></li>
              <li><svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="14" cy="15" r="7" fill="none" stroke="currentColor" strokeWidth="3" /><path d="M19 20l14 14M28 29l3-3" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /><path d="M6 34L34 6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg><div><b>No key</b><span>Docket signs nothing</span></div></li>
            </ul>
            <p className="srcs"><a href="account.html?account=meta-pool.near">Follow the whole path for meta-pool.near →</a></p>
          </div>
        </div></section>
      </main>

      <footer><div className="wrap">
        <a href={REPO}>github.com/aditi3175/docket</a>
        <span>Read-only, holds no key</span>
        <span>{censusLine}</span>
      </div></footer>

      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true"><defs>
        <linearGradient id="kg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#9A8994" /><stop offset=".5" stopColor="#5F4D5A" /><stop offset="1" stopColor="#2F232C" /></linearGradient>
        <symbol id="i-key" viewBox="0 0 64 64"><circle cx="20" cy="22" r="12" fill="none" stroke="#241722" strokeWidth="5" /><path d="M29 30 L54 55 M44 45 L50 39 M50 51 L56 45" stroke="#241722" strokeWidth="5" strokeLinecap="round" fill="none" /></symbol>
        <symbol id="i-factory" viewBox="0 0 64 64"><path d="M8 56 V30 L22 38 V30 L36 38 V20 h10 v36 Z" fill="#241722" /><rect x="40" y="10" width="6" height="12" fill="#241722" /><rect x="14" y="44" width="6" height="6" fill="#F8F4F7" /><rect x="28" y="44" width="6" height="6" fill="#F8F4F7" /></symbol>
        <symbol id="i-dao" viewBox="0 0 64 64"><g fill="#B3261E"><path d="M32 6 L58 20 H6 Z" /><rect x="10" y="24" width="6" height="24" /><rect x="22" y="24" width="6" height="24" /><rect x="36" y="24" width="6" height="24" /><rect x="48" y="24" width="6" height="24" /><rect x="6" y="50" width="52" height="7" /></g></symbol>
        <symbol id="i-dao-v" viewBox="0 0 64 64"><g fill="#6A3FB5"><path d="M32 6 L58 20 H6 Z" /><rect x="10" y="24" width="6" height="24" /><rect x="22" y="24" width="6" height="24" /><rect x="36" y="24" width="6" height="24" /><rect x="48" y="24" width="6" height="24" /><rect x="6" y="50" width="52" height="7" /></g></symbol>
        <symbol id="i-dao-u" viewBox="0 0 64 64"><g fill="none" stroke="#8C7D87" strokeWidth="2.5" strokeDasharray="4 3"><path d="M32 6 L58 20 H6 Z" /><rect x="8" y="24" width="48" height="33" /></g></symbol>
        <symbol id="i-coins" viewBox="0 0 64 64"><ellipse cx="32" cy="48" rx="20" ry="7" fill="#45333F" /><rect x="12" y="34" width="40" height="14" fill="#45333F" /><ellipse cx="32" cy="34" rx="20" ry="7" fill="#6E5C68" /><rect x="12" y="20" width="40" height="14" fill="#6E5C68" /><ellipse cx="32" cy="20" rx="20" ry="7" fill="#B3A4AE" /></symbol>
        <symbol id="i-code" viewBox="0 0 64 64"><rect x="6" y="10" width="52" height="44" rx="5" fill="#45333F" /><path d="M24 24 L15 32 L24 40 M40 24 L49 32 L40 40 M35 21 L29 43" stroke="#F8F4F7" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" /></symbol>
        <g id="keyshape"><circle cx="17" cy="14" r="12" fill="none" stroke="url(#kg)" strokeWidth="6" /><rect x="14" y="25" width="6" height="52" rx="2" fill="url(#kg)" /><rect x="20" y="58" width="9" height="5" fill="url(#kg)" /><rect x="20" y="68" width="6" height="5" fill="url(#kg)" /></g>
      </defs></svg>
    </>
  );
}

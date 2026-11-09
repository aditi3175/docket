// The homepage. Every figure comes from ../web/assets through lib/finding.js; recorded values are shown
// first and labelled, then replaced by live reads as they land. No figure is typed in here.
import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { createRpc } from '../../web/assets/rpc.js';
import { liveCounter, pct } from '../../web/assets/census.js';
import { SOURCE } from '../../web/assets/source.js';
import { useFinding, useCensus, headline, usd, time, nearShort, pct0, RECORDED } from './lib/finding.js';
import AuthorityPath from './components/AuthorityPath.jsx';
import { Header, Footer, REPO } from './components/Chrome.jsx';

const TX = (h) => `https://nearblocks.io/txns/${h}`;

function Headline({ of }) {
  const text = headline(of);
  const cut = text.indexOf(', without a vote.');
  if (cut < 0) return <>{text}</>;
  return <>{text.slice(0, cut)}, <span className="text-coral">without a vote</span>.</>;
}

function Summary({ s }) {
  const r = s.headlineOf;
  const valued = r.rows.filter((x) => x.slug && x.autoUpdate === true).map((x) => x.name).join(' and ');
  const nearx = r.rows.find((x) => !x.slug && x.autoUpdate === true && (x.staked?.near));
  if (typeof r.exposedUsd !== 'number') return <>The dollar figure is unknown right now.</>;
  return <>{valued}, {pct0(r.exposedUsd, r.lsTotal)} of NEAR liquid staking{nearx ? <>, plus {nearShort(nearx.staked.near)} in NearX</> : null}.</>;
}

function Provenance({ s }) {
  const r = s.headlineOf;
  const money = typeof r.exposedUsd === 'number' ? `${usd(r.exposedUsd)} of ${usd(r.lsTotal)}, NEAR-only TVL` : 'value unknown';
  if (s.failed) return <>Unknown: the page failed while reading ({s.failed}). Shown: the values recorded {time(RECORDED.llamaReadAt)}.</>;
  if (s.gaps.length) return <>Live reads failed at {time(s.readAt)}: {s.gaps.join(', ')}. Shown: the values recorded {time(RECORDED.llamaReadAt)} (DefiLlama) and {RECORDED.chainRecordedOn} (chain); the path shows what could not be read now.</>;
  if (s.recorded) return <>Recorded values: DefiLlama {money}, {time(RECORDED.llamaReadAt)} · NEAR mainnet, {RECORDED.chainRecordedOn}. Reading live now…</>;
  return <>DefiLlama {money}, read {time(s.llamaReadAt)} · NEAR mainnet, read {time(s.readAt)}</>;
}

function Hero({ s }) {
  const still = useReducedMotion();
  const live = !s.recorded && !s.gaps.length && !s.failed;
  return (
    <section className="relative overflow-hidden bg-night text-ivory">
      <div className="pointer-events-none absolute inset-0 grid-bg [mask-image:radial-gradient(ellipse_at_70%_20%,black,transparent_75%)]" />
      <div className="pointer-events-none absolute -top-40 right-[-10%] h-[520px] w-[520px] rounded-full bg-violet/25 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-[-200px] left-[-120px] h-[420px] w-[420px] rounded-full bg-violet/15 blur-[120px]" />
      <div className="relative mx-auto max-w-7xl px-5 pb-12 pt-8 sm:px-8 lg:pt-10">
        <div className="grid items-end gap-8 lg:grid-cols-[1.55fr_1fr] lg:gap-14">
          <motion.h1 initial={still ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
            className="font-display text-[clamp(2.1rem,3.9vw,3.45rem)] font-bold leading-[1.03] tracking-[-0.035em] [text-wrap:balance]">
            <Headline of={s.headlineOf} />
          </motion.h1>
          <div className="pb-1.5">
            <p className="text-lg font-medium leading-snug text-ivory/90 sm:text-xl"><Summary s={s} /></p>
            <p className="mt-3 flex gap-2 text-[13px] leading-relaxed text-haze" aria-live="polite">
              <span className={`mt-[5px] h-2 w-2 flex-none rounded-full ${live ? 'bg-violet-2' : 'border border-dashed border-haze'}`} />
              <span><Provenance s={s} /></span>
            </p>
          </div>
        </div>
        <div className="mt-7 rounded-[28px] bg-night-2/80 px-5 pb-5 pt-3 ring-1 ring-white/10 shadow-[0_40px_120px_-40px_rgba(135,85,217,0.45)] sm:px-8 sm:pb-6 sm:pt-4">
          <AuthorityPath rows={s.rows} keys={s.keys} />
        </div>
      </div>
    </section>
  );
}

function Card({ n, title, children, tone = 'paper', className = '' }) {
  const tones = { paper: 'bg-paper ring-ink/10', violet: 'bg-violet-soft ring-violet/20', night: 'bg-night text-ivory ring-white/10' };
  return (
    <article className={`group relative flex flex-col rounded-[24px] p-6 ring-1 transition duration-300 hover:-translate-y-1 hover:shadow-[8px_8px_0_0_#1F1828] ${tones[tone]} ${className}`}>
      <div className="flex items-center justify-between">
        <span className={`font-mono text-xs ${tone === 'night' ? 'text-haze' : 'text-mute'}`}>{n}</span>
      </div>
      <h2 className="mt-3 font-display text-xl font-bold leading-tight tracking-tight">{title}</h2>
      {children}
    </article>
  );
}

function Evidence({ children }) { return <div className="mt-auto flex flex-col gap-1.5 pt-5 text-sm">{children}</div>; }
function A({ href, children, light }) { return <a href={href} className={`w-fit underline underline-offset-4 ${light ? 'decoration-white/30 hover:decoration-white' : 'decoration-ink/25 hover:decoration-ink'}`}>{children}</a>; }

function FixCard({ badge }) {
  const word = !badge ? 'Reading the factory…' : { 'not-shipped': 'Not shipped', 'factory-changed': 'The factory has changed', unknown: 'Unknown' }[badge.state] ?? 'Unknown';
  return (
    <Card n="01" title="The fix exists. It is not deployed.">
      <p className={`mt-4 inline-flex items-center gap-2 font-display text-3xl font-bold tracking-tight ${!badge || badge.state === 'unknown' ? 'text-mute italic' : ''}`}>
        <span className={`h-3 w-3 rounded-full ${!badge || badge.state === 'unknown' ? 'border-2 border-dashed border-mute' : 'bg-ink'}`} />{word}
      </p>
      <p className="mt-3 text-[15px] leading-relaxed text-mute">{badge ? badge.text.replace(/^Fix shipped\? (No\. )?/, '') : 'PR #233 makes a factory update wait for a matching proposal. Whether the factory publishes it is read live.'}</p>
      <Evidence>
        <A href="https://github.com/near-daos/sputnik-dao-contract/pull/233">PR #233, merged 2026-03-24</A>
        <span className="text-mute">{badge ? (badge.state === 'unknown' ? `Factory read failed: ${badge.detail}` : `Factory read ${time(badge.readAt)}`) : 'Factory read: pending'}</span>
      </Evidence>
    </Card>
  );
}

function CensusCard() {
  const c = useCensus();
  const [live, setLive] = useState(null);
  const [busy, setBusy] = useState(false);
  const recount = async () => {
    setBusy(true); setLive('Reading the DAO list from the factory…');
    const r = await liveCounter(createRpc(), { onProgress: ({ done, total, counts }) => setLive(`${counts.false} opted out so far · ${done} of ${total} DAOs read`) });
    setLive(r.status !== 'ok' ? `Unknown: ${r.reason}` : `Recounted from the chain (${time(r.readAt)}): ${r.counts.false} of ${r.denominator} read false, ${r.counts.true} true, ${r.counts['no-factory-info']} no get_factory_info, ${r.counts.unread} unread.`);
    setBusy(false);
  };
  if (c.status !== 'ok') {
    return (
      <Card n="02" title="Most DAOs are exposed" className={c.status === 'unknown' ? 'ring-2 ring-dashed' : ''}>
        <p className="mt-4 font-display text-3xl font-bold italic text-mute">{c.status === 'reading' ? 'Reading the census…' : 'Census unknown'}</p>
        {c.status === 'unknown' && <p className="mt-2 text-sm text-mute">{c.reason}</p>}
      </Card>
    );
  }
  const k = c.c.counts; const unknown = k['no-factory-info'] + k.unread; const d = c.c.denominator;
  return (
    <Card n="02" title="Most DAOs are exposed">
      <p className="mt-4 font-display text-4xl font-bold tracking-tight num"><span className="text-coral-ink">{k.true.toLocaleString('en-US')}</span><span className="text-xl font-semibold text-mute"> of {d.toLocaleString('en-US')} DAOs</span></p>
      <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-ink/10" aria-hidden="true">
        <span className="bg-coral" style={{ width: `${(100 * k.true) / d}%` }} />
        <span className="bg-violet" style={{ width: `${Math.max(0.6, (100 * k.false) / d)}%` }} />
        <span className="bg-[repeating-linear-gradient(-45deg,#B9AFC6_0_3px,transparent_3px_7px)]" style={{ width: `${(100 * unknown) / d}%` }} />
      </div>
      <p className="mt-3 text-[15px] leading-relaxed text-mute">read auto_update: true, so the factory can replace their code without a vote ({pct(c.c.shareTrueOfAnswered)} of the {c.c.answered.toLocaleString('en-US')} that answered). <b className="text-violet">{k.false} read false.</b> Unknown: {k['no-factory-info']} have no get_factory_info, {k.unread} could not be read. Census {c.when?.slice(0, 10)}{c.complete ? '' : ', incomplete'}.</p>
      <Evidence>
        <A href="register.html">Every DAO in the register</A>
        <button type="button" onClick={recount} disabled={busy} className="mt-1 w-fit rounded-full border-[1.5px] border-ink px-4 py-2 text-left text-sm font-semibold transition hover:bg-ink hover:text-ivory disabled:opacity-60">Recount from the chain now (about 15 minutes)</button>
        {live && <span className="text-mute" aria-live="polite">{live}</span>}
      </Evidence>
    </Card>
  );
}

function OptOutCard() {
  return (
    <Card n="03" title="One proposal turns it off" tone="violet">
      <p className="mt-4 font-display text-4xl font-bold tracking-tight">1 proposal</p>
      <p className="mt-3 text-[15px] leading-relaxed text-ink/75">A DAO passes one FactoryInfoUpdate setting auto_update to false. Tested on mainnet: with it, the factory’s update was rejected; without it, the same update ran.</p>
      <Evidence>
        <A href="optout.html?dao=stnear.sputnik-dao.near">Draft it for <span className="id text-[13px]">stnear.sputnik-dao.near</span></A>
        <A href={TX('772n4ZWMRtmXwsWuVTSP5F1UkbZ27UNyM9SqVzgXnXFS')}>Rejected, opted out</A>
        <A href={TX('EZw51V5kCMeCCMsmNw5WqDsSUK8R2CHs4WyeK4jTtB1b')}>Ran, not opted out</A>
      </Evidence>
    </Card>
  );
}

function DelegateCard() {
  return (
    <Card n="04" title="A delegate that can’t overreach" tone="night">
      <p className="mt-4 font-display text-4xl font-bold tracking-tight">Approved 1, refused 1</p>
      <p className="mt-3 text-[15px] leading-relaxed text-haze">A council member whose only key can call act_proposal on one DAO. It approved a routine transfer, then refused one with the same words and a different receiver, and handed it to a human. Any AI agent can run the same checks before it acts, through Docket’s MCP server.</p>
      <Evidence>
        <A light href={TX('HnMopqHKJaJ7jJNY4sWkHoYJH6TLwZnVFmNzPh9ur6wZ')}>Its approval of #7</A>
        <A light href={`${REPO}/blob/master/agent/log/docket-demo.sputnik-dao.near-8.json`}>Its refusal of #8, with the report</A>
      </Evidence>
    </Card>
  );
}

const STEPS = [
  ['A DAO votes on its own code.', 'Sputnik DAOs change their code with an UpgradeSelf proposal that members must pass.'],
  ['update() is not a proposal.', 'It accepts new code from the factory whenever the DAO reads auto_update: true, and true is the default.'],
  ['The factory answers to three keys.', 'sputnik-dao.near owns itself; its full-access keys are its only authority. No vote stands between them and the code.'],
];

export default function Home() {
  const s = useFinding();
  const c = useCensus();
  const censusLine = c.status === 'ok' ? `Census ${c.when?.slice(0, 10)}: ${c.c.denominator.toLocaleString('en-US')} DAOs${c.complete ? '' : ' (incomplete)'}` : c.status === 'reading' ? 'Census: reading graph.json…' : 'Census: unknown (graph.json unread)';
  return (
    <>
      <Header current="Overview" />
      <main id="main">
        <Hero s={s} />
        <section className="bg-ivory">
          <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-20">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">What else is true, and how to check it</h2>
              <p className="max-w-md text-[15px] text-mute">Each card links to its evidence: a source line, a mainnet transaction, or a log.</p>
            </div>
            <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
              <FixCard badge={s.badge} />
              <CensusCard />
              <OptOutCard />
              <DelegateCard />
            </div>
          </div>
        </section>
        <section className="bg-paper">
          <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-20">
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">How the vote is skipped</h2>
            <ol className="mt-8 grid gap-5 md:grid-cols-3">
              {STEPS.map(([t, d], i) => (
                <li key={t} className="rounded-[24px] bg-ivory p-6 ring-1 ring-ink/10">
                  <span className={`grid h-9 w-9 place-items-center rounded-full font-mono text-sm font-bold ${i === 1 ? 'bg-coral text-ink' : 'bg-ink text-ivory'}`}>{i + 1}</span>
                  <h3 className="mt-4 font-display text-xl font-bold tracking-tight">{t}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-mute">{d}</p>
                </li>
              ))}
            </ol>
            <p className="mt-6 text-sm text-mute">Source: <A href={SOURCE.updateAssert.href}>{SOURCE.updateAssert.text}</A> · <A href={SOURCE.defaultTrue.href}>{SOURCE.defaultTrue.text}</A></p>
          </div>
        </section>
        <section className="bg-ivory">
          <div className="mx-auto max-w-7xl px-5 pb-20 sm:px-8">
            <form action="account.html" className="flex flex-col gap-5 rounded-[28px] bg-night p-8 text-ivory sm:p-10 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="font-display text-3xl font-bold tracking-tight">Check any NEAR account</h2>
                <p className="mt-2 max-w-lg text-haze">Docket follows every path by which its code or rules can change, and shows which of them needs no vote.</p>
              </div>
              <div className="flex w-full max-w-xl gap-2">
                <label className="sr-only" htmlFor="acct">NEAR account</label>
                <input id="acct" name="account" defaultValue="meta-pool.near" spellCheck={false} autoCapitalize="off" autoComplete="off"
                  className="min-w-0 flex-1 rounded-full bg-white/8 px-5 py-3 font-mono text-[15px] text-ivory ring-1 ring-white/15 placeholder:text-haze focus:outline-none focus:ring-2 focus:ring-violet-2" />
                <button className="flex-none rounded-full bg-violet px-6 py-3 font-semibold text-white transition hover:bg-violet-2 hover:text-ink">Read</button>
              </div>
            </form>
          </div>
        </section>
      </main>
      <Footer censusLine={censusLine} />
    </>
  );
}

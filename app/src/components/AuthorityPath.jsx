// The authority path, drawn: value → protocol contract → owner DAO → (coral: auto_update true, no vote)
// → sputnik-dao.near → its full-access keys. Each edge draws when the read behind it lands, so the motion
// shows data arriving; until then it shows the recorded value, faint. Reduced motion renders it complete.
// Colour: coral only for an edge the factory crosses without a vote; violet for "owns / controls";
// a dashed, colourless edge for a read that failed (unknown, never a value).
import { motion, useReducedMotion } from 'motion/react';
import { usdShort, nearShort } from '../lib/finding.js';

const C = { coral: '#FF786F', violet: '#B48CF2', line: 'rgba(255,255,255,0.22)', haze: '#B9AFC6', ivory: '#F7F3F4', pill: '#261E31', butter: '#FFF3C4', factory: '#8755D9' };

function Edge({ d, state, kind = 'owns', still, width }) {
  const unknown = state === 'unknown';
  const color = unknown ? C.haze : kind === 'novote' ? C.coral : kind === 'gate' ? C.violet : C.violet;
  const w = width ?? (kind === 'novote' ? 9 : 3);
  const common = { d, fill: 'none', stroke: color, strokeWidth: w, strokeLinecap: 'round', strokeLinejoin: 'round', strokeDasharray: unknown ? '6 8' : undefined };
  if (state === 'recorded') return <path {...common} opacity={0.25} />;
  if (unknown || still) return <path {...common} opacity={unknown ? 0.7 : 1} />;
  return <motion.path key={`${d}-${state}-${kind}`} {...common} initial={{ pathLength: 0, opacity: 0.4 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: 0.9, ease: [0.3, 0.1, 0.2, 1] }} />;
}

function Pill({ x, y, w, h = 44, text, sub, state, href, fill = C.pill, mono = true }) {
  const unknown = state === 'unknown';
  const body = (
    <g opacity={state === 'recorded' ? 0.6 : 1} style={{ transition: 'opacity .4s' }}>
      <rect x={x} y={y - h / 2} width={w} height={h} rx={h / 2} fill={fill} stroke={unknown ? C.haze : 'rgba(255,255,255,0.28)'} strokeWidth={1.5} strokeDasharray={unknown ? '5 6' : undefined} />
      <text x={x + 20} y={y + 5} fill={unknown ? C.haze : C.ivory} fontFamily={mono ? 'JetBrains Mono Variable, monospace' : 'Inter Variable'} fontSize={15} fontStyle={unknown ? 'italic' : 'normal'}>{text}<title>{text}</title></text>
      {sub && <text x={x + 20} y={y + h / 2 + 18} fill={C.haze} fontSize={12} fontFamily="Inter Variable">{sub}</text>}
    </g>
  );
  return href ? <a href={href}>{body}</a> : body;
}

function Key({ cx, cy }) {
  return (
    <g stroke={C.butter} strokeWidth={3} fill="none" strokeLinecap="round">
      <circle cx={cx} cy={cy} r={9} />
      <path d={`M${cx + 9} ${cy}h24m-6 0v7m-7 -7v6`} />
    </g>
  );
}

const valueText = (r) => (r.slug ? (typeof r.usd === 'number' ? usdShort(r.usd) : 'unknown') : r.stakedNear ? nearShort(r.stakedNear) : 'unknown');
const factoryKind = (r) => (r.autoUpdate === true ? 'novote' : r.autoUpdate === false ? 'gate' : 'novote');

function Desktop({ rows, keys, still }) {
  const ys = [80, 210, 340]; const fy = 210;
  const nKeys = keys.count ?? 1; const kys = nKeys === 1 ? [fy] : Array.from({ length: nKeys }, (_, i) => fy - 70 + (140 * i) / (nKeys - 1));
  return (
    <svg viewBox="0 0 1250 430" className="w-full h-auto" role="img" aria-label="The authority path from the value at stake, through each protocol's owner DAO, to the factory's keys">
      {rows.map((r, i) => {
        const y = ys[i];
        const fk = factoryKind(r);
        return (
          <g key={r.contract}>
            <text x={0} y={y - 2} fill={r.edges.value === 'unknown' ? C.haze : C.ivory} fontFamily="Bricolage Grotesque Variable" fontWeight={700} fontSize={28} opacity={r.edges.value === 'recorded' ? 0.6 : 1}>{valueText(r)}</text>
            <text x={0} y={y + 20} fill={C.haze} fontSize={13} fontFamily="Inter Variable">{r.name}{r.slug ? ' · DefiLlama' : ' · staked, on chain'}</text>
            <Edge d={`M200 ${y} H232`} state={r.edges.value} still={still} />
            <Pill x={232} y={y} w={236} text={r.contract} state={r.edges.value === 'recorded' ? 'recorded' : 'live'} href={`account.html?account=${encodeURIComponent(r.contract)}`} />
            <Edge d={`M468 ${y} H504`} state={r.edges.owner} still={still} />
            <Pill x={504} y={y} w={300} text={r.owner === 'unknown' || r.owner === 'none' ? `owner ${r.owner}` : r.owner} state={r.edges.owner} mono={r.owner !== 'unknown'} href={r.edges.owner === 'live' ? `docket.html?dao=${encodeURIComponent(r.owner)}` : undefined} />
            <Edge d={`M804 ${y} C890 ${y} 890 ${fy} 960 ${fy}`} state={r.edges.factory} kind={fk} still={still} />
            {r.edges.factory === 'live' && fk === 'novote' && <text x={822} y={y > fy ? y + 26 : y - 12} fill={C.coral} fontSize={13} fontWeight={700} fontFamily="Inter Variable">no vote</text>}
            {r.edges.factory === 'live' && fk === 'gate' && <text x={822} y={y - 12} fill={C.violet} fontSize={13} fontWeight={700} fontFamily="Inter Variable">opted out: vote required</text>}
          </g>
        );
      })}
      <g opacity={keys.state === 'recorded' ? 0.75 : 1}>
        <rect x={960} y={fy - 58} width={196} height={116} rx={26} fill={C.factory} stroke="rgba(255,255,255,0.35)" strokeWidth={1.5} />
        <text x={982} y={fy - 10} fill="#fff" fontFamily="JetBrains Mono Variable" fontSize={15} fontWeight={600}>sputnik-dao.near</text>
        <text x={982} y={fy + 14} fill="#E9DFFA" fontSize={12.5} fontFamily="Inter Variable">the Sputnik factory</text>
        <text x={982} y={fy + 32} fill="#E9DFFA" fontSize={12.5} fontFamily="Inter Variable">owns itself</text>
      </g>
      {kys.map((ky, j) => (
        <g key={j}>
          <Edge d={`M1156 ${fy} C1172 ${fy} 1168 ${ky} 1186 ${ky}`} state={keys.state} still={still} width={2.5} />
          {keys.state !== 'unknown' && <Key cx={1196} cy={ky} />}
        </g>
      ))}
      <text x={1250} y={fy + 105} textAnchor="end" fill={keys.state === 'unknown' ? C.haze : C.butter} fontSize={13} fontWeight={600} fontFamily="Inter Variable">{keys.state === 'unknown' ? 'keys unknown' : `${keys.count} full-access keys`}</text>
    </svg>
  );
}

function Mobile({ rows, keys, still }) {
  const lane = 178; const fy = 3 * lane + 40;
  return (
    <svg viewBox="0 0 360 720" className="w-full h-auto" role="img" aria-label="The authority path, stacked for a narrow screen">
      {rows.map((r, i) => {
        const y0 = 16 + i * lane; const fk = factoryKind(r); const gx = 342 - i * 8;
        return (
          <g key={r.contract}>
            <text x={0} y={y0 + 24} fill={C.ivory} fontFamily="Bricolage Grotesque Variable" fontWeight={700} fontSize={26} opacity={r.edges.value === 'recorded' ? 0.6 : 1}>{valueText(r)}</text>
            <text x={0} y={y0 + 42} fill={C.haze} fontSize={12}>{r.name}</text>
            <Edge d={`M22 ${y0 + 50} V${y0 + 64}`} state={r.edges.value} still={still} />
            <Pill x={0} y={y0 + 86} w={300} h={42} text={r.contract} state={r.edges.value === 'recorded' ? 'recorded' : 'live'} />
            <Edge d={`M22 ${y0 + 107} V${y0 + 121}`} state={r.edges.owner} still={still} />
            <Pill x={0} y={y0 + 142} w={300} h={42} text={r.owner === 'unknown' || r.owner === 'none' ? `owner ${r.owner}` : r.owner} state={r.edges.owner} />
            <Edge d={`M300 ${y0 + 142} H${gx - 10} Q${gx} ${y0 + 142} ${gx} ${y0 + 152} V${fy - 30}`} state={r.edges.factory} kind={fk} still={still} width={fk === 'novote' ? 6 : 3} />
          </g>
        );
      })}
      <rect x={0} y={fy - 30} width={346} height={74} rx={22} fill={C.factory} stroke="rgba(255,255,255,0.35)" />
      <text x={20} y={fy + 2} fill="#fff" fontFamily="JetBrains Mono Variable" fontSize={15} fontWeight={600}>sputnik-dao.near</text>
      <text x={20} y={fy + 22} fill="#E9DFFA" fontSize={12.5}>the Sputnik factory · owns itself</text>
      {Array.from({ length: keys.count ?? 1 }, (_, j) => { const kx = 60 + j * 100; return (
        <g key={j}><Edge d={`M${kx} ${fy + 44} V${fy + 76}`} state={keys.state} still={still} width={2.5} />{keys.state !== 'unknown' && <Key cx={kx} cy={fy + 88} />}</g>
      ); })}
      <text x={0} y={fy + 132} fill={C.butter} fontSize={13} fontWeight={600}>{keys.state === 'unknown' ? 'keys unknown' : `${keys.count} full-access keys`}</text>
    </svg>
  );
}

export default function AuthorityPath({ rows, keys }) {
  const still = useReducedMotion();
  return (
    <figure className="relative">
      <div className="hidden md:block"><Desktop rows={rows} keys={keys} still={still} /></div>
      <div className="md:hidden"><Mobile rows={rows} keys={keys} still={still} /></div>
      <figcaption className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-haze">
        <span className="inline-flex items-center gap-2"><i className="inline-block h-[5px] w-8 rounded-full bg-coral" />No vote: update() is not a proposal while auto_update is true</span>
        <span className="inline-flex items-center gap-2"><i className="inline-block h-[2px] w-8 rounded-full bg-violet-2" />Owns or controls</span>
        <span className="inline-flex items-center gap-2"><i className="inline-block w-8 border-t-2 border-dashed border-haze" />Unknown: a read failed</span>
      </figcaption>
    </figure>
  );
}

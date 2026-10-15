import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useScroll, useTransform, type MotionValue } from 'motion/react';
import { ArrowRight, MagnifyingGlass, Warning, CheckCircle, XCircle, HardDrives, Cube, Coins } from '@phosphor-icons/react';
import { RollingNumber } from './rolling-number';
import { type Load, type Network, type Nominator, ago, fmtPOT, getJson } from '../lib/api';

const reveal = {
  initial: { opacity: 0, y: 14 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
  transition: { duration: 0.7, ease: [0.23, 1, 0.32, 1] as const },
};

function Source({ net }: { net: Network }) {
  return (
    <p className="text-[13px] text-muted">
      Portaldot mainnet, block #{net.block.height.toLocaleString('en-US')} · {ago(net.computedAt)}
    </p>
  );
}

function Unavailable({ what, reason }: { what: string; reason: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-line bg-card/60 p-5 text-[15px] text-ink/80">
      <Warning size={20} className="mt-0.5 shrink-0 text-accent" />
      <span>Couldn't load {what} from the mainnet node right now ({reason}). Nothing on this page is shown as zero when it's unknown.</span>
    </div>
  );
}

export function LiveNumbers({ net }: { net: Load<Network> }) {
  return (
    <section id="network" className="mx-auto max-w-6xl px-6 pt-28">
      <motion.p {...reveal} className="text-[15px] font-medium text-accent">Live from Portaldot mainnet</motion.p>
      <motion.h2 {...reveal} className="mt-3 max-w-[20ch] text-[clamp(28px,4.6vw,60px)] [overflow-wrap:anywhere] display">
        Rewards are expiring while nobody's looking.
      </motion.h2>
      <div className="mt-14">
        {net.state === 'loading' && <div className="h-64 animate-pulse rounded-3xl bg-ink/[0.04]" />}
        {net.state === 'error' && <Unavailable what="network numbers" reason={net.reason} />}
        {net.state === 'ok' && <NumbersGrid net={net.data} />}
      </div>
    </section>
  );
}

function NumbersGrid({ net }: { net: Network }) {
  const stats = [
    { value: fmtPOT(net.rewards.expiring7dPOT), unit: 'POT', label: 'of staking rewards expire this week unless someone claims them', note: 'Estimate, Portaldot\'s stake-weighted payout formula' },
    { value: fmtPOT(net.rewards.unclaimedGrossPOT), unit: 'POT', label: 'sits unclaimed inside the 84-era window', note: 'Estimate, gross validator + nominator pools' },
    { value: fmtPOT(net.idleNominations.bondedPOT), unit: 'POT', label: `is nominating a validator that isn't active (${net.idleNominations.accounts} accounts)`, note: 'Earns nothing this era' },
    { value: `${net.concentration.top1Pct.toFixed(1)}%`, unit: '', label: 'of active stake sits with one validator', note: `Finality needs ${net.finality.threshold} of ${net.finality.authorities} validators` },
    { value: `${net.validators.active}/${net.validators.target}`, unit: '', label: 'validator seats filled', note: `${net.validators.waiting} waiting to join` },
  ];
  return (
    <>
      <div className="grid gap-px overflow-hidden rounded-3xl border border-line bg-line md:grid-cols-6">
        {stats.map((s, i) => (
          <motion.div
            key={s.label}
            {...reveal}
            transition={{ ...reveal.transition, delay: i * 0.06 }}
            className={`bg-paper p-7 ${i < 2 ? 'md:col-span-3' : 'md:col-span-2'}`}
          >
            <div className={`display whitespace-nowrap ${i < 2 ? 'text-[clamp(44px,5.4vw,76px)]' : 'text-[clamp(36px,3.6vw,52px)]'}`}>
              <RollingNumber value={s.value} />
              {s.unit && <span className="ml-2 text-[0.4em] tracking-normal text-muted">{s.unit}</span>}
            </div>
            <p className="mt-3 max-w-[30ch] text-[16px] leading-snug text-ink/80">{s.label}</p>
            <p className="mt-2 text-[13px] text-muted">{s.note}</p>
          </motion.div>
        ))}
      </div>
      <div className="mt-4"><Source net={net} /></div>
    </>
  );
}

const STEPS = [
  {
    icon: HardDrives, title: 'Install a node', img: '/art/step-install.webp',
    body: 'One command starts a Portaldot node beside PortalNode. The official binary is checked against a pinned hash before it runs.',
    code: 'docker compose up -d',
  },
  {
    icon: Cube, title: 'Sync and verify', img: '/art/step-sync.webp',
    body: 'PortalNode reads the runtime\'s own metadata to learn what this chain supports, so it never guesses a call. Your stash keys stay in your wallet.',
    code: 'runtime portaldot/1002 · metadata v13',
  },
  {
    icon: Coins, title: 'Keep rewards claimed', img: '/art/step-rewards.webp',
    body: 'Any account can claim an era\'s rewards for a validator and its nominators. PortalNode claims each one before the 84-era window closes and links the transaction.',
    code: 'staking.payoutStakers(stash, era)',
  },
];

function StepCard({ i, progress, step }: { i: number; progress: MotionValue<number>; step: (typeof STEPS)[number] }) {
  const start = i / STEPS.length;
  const y = useTransform(progress, [start - 0.25, start], ['70%', '0%']);
  const scale = useTransform(progress, [start, start + 0.33], [1, i === STEPS.length - 1 ? 1 : 0.94]);
  const dim = useTransform(progress, [start, start + 0.33], [1, i === STEPS.length - 1 ? 1 : 0.55]);
  const [imgOk, setImgOk] = useState(true);
  const Icon = step.icon;
  return (
    <motion.article
      style={{ y: i === 0 ? '0%' : y, scale, opacity: dim, zIndex: i }}
      className="absolute inset-0 grid overflow-hidden rounded-[28px] border border-line bg-card shadow-[0_24px_60px_-30px_#14141340] md:grid-cols-2"
    >
      <div className="flex flex-col justify-between p-8 md:p-12">
        <div>
          <div className="flex items-center gap-3 text-[15px] font-medium text-muted">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-ink text-paper"><Icon size={18} /></span>
            Step {i + 1} of 3
          </div>
          <h3 className="mt-8 text-[clamp(32px,3.6vw,52px)] display">{step.title}</h3>
          <p className="mt-5 max-w-[34ch] text-[18px] leading-relaxed text-ink/75">{step.body}</p>
        </div>
        <code className="mt-8 self-start rounded-full bg-paper px-4 py-2 font-mono text-[14px] text-ink/80 shadow-[inset_0_0_0_1px_#1414131a]">{step.code}</code>
      </div>
      <div className="relative hidden bg-paper md:block">
        {imgOk && <img src={step.img} alt="" onError={() => setImgOk(false)} className="absolute inset-0 h-full w-full object-cover" />}
      </div>
    </motion.article>
  );
}

export function Steps() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const bar = useTransform(scrollYProgress, [0, 1], ['0%', '100%']);
  return (
    <section id="how" ref={ref} className="relative mt-32 h-[320vh]">
      <div className="sticky top-0 flex h-screen flex-col justify-center px-6">
        <div className="mx-auto w-full max-w-6xl">
          <div className="mb-8 flex items-end justify-between gap-6">
            <h2 className="max-w-[16ch] text-[clamp(28px,4.6vw,60px)] [overflow-wrap:anywhere] display">From a bare server to rewards that never lapse.</h2>
            <div className="hidden h-1 w-48 overflow-hidden rounded-full bg-ink/10 md:block">
              <motion.div style={{ width: bar }} className="h-full rounded-full bg-accent" />
            </div>
          </div>
          <div className="relative h-[min(62vh,560px)]">
            {STEPS.map((s, i) => <StepCard key={s.title} i={i} step={s} progress={scrollYProgress} />)}
          </div>
        </div>
      </div>
    </section>
  );
}

const TABS = ['Overview', 'Rewards', 'Network'] as const;

export function ConsolePreview({ net }: { net: Load<Network> }) {
  const [tab, setTab] = useState(0);
  const [auto, setAuto] = useState(true);
  useEffect(() => {
    if (!auto) return;
    const id = setTimeout(() => setTab((t) => (t + 1) % TABS.length), 7000);
    return () => clearTimeout(id);
  }, [tab, auto]);

  return (
    <section id="console" className="mx-auto max-w-6xl px-6 pt-32">
      <motion.h2 {...reveal} className="max-w-[18ch] text-[clamp(28px,4.6vw,60px)] [overflow-wrap:anywhere] display">
        One console for the node, the rewards and the network.
      </motion.h2>
      <div className="mt-10 flex flex-wrap gap-2" role="tablist" aria-label="Console views">
        {TABS.map((t, i) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === i}
            onClick={() => { setTab(i); setAuto(false); }}
            className={`relative overflow-hidden rounded-full px-5 py-2.5 text-[15px] font-medium transition-colors ${tab === i ? 'bg-ink text-paper' : 'bg-ink/[0.05] text-ink/75 hover:bg-ink/10'}`}
          >
            {t}
            {tab === i && auto && (
              <motion.span key={tab} initial={{ width: '0%' }} animate={{ width: '100%' }} transition={{ duration: 7, ease: 'linear' }} className="absolute bottom-0 left-0 h-[2px] bg-accent" />
            )}
          </button>
        ))}
      </div>
      <motion.div {...reveal} className="mt-6 overflow-hidden rounded-[22px] bg-con text-con-fg shadow-[0_40px_80px_-40px_#141413aa]">
        <div className="flex items-center gap-2 border-b border-white/10 px-5 py-3.5 text-[13px] text-con-fg/60">
          <span className="h-2.5 w-2.5 rounded-full bg-card/20" /><span className="h-2.5 w-2.5 rounded-full bg-card/20" /><span className="h-2.5 w-2.5 rounded-full bg-card/20" />
          <span className="ml-3">PortalNode console · preview with live mainnet data</span>
        </div>
        <div className="grid min-h-[440px] md:grid-cols-[200px_1fr]">
          <aside className="hidden border-r border-white/10 p-4 text-[14px] md:block">
            {['Overview', 'Setup', 'Rewards', 'Network', 'Alerts', 'Updates'].map((x) => (
              <div key={x} className={`rounded-lg px-3 py-2 ${x === TABS[tab] ? 'bg-card/10 text-con-fg' : 'text-con-fg/50'}`}>{x}</div>
            ))}
          </aside>
          <div className="p-6 md:p-8">
            {net.state === 'loading' && <div className="h-72 animate-pulse rounded-xl bg-card/5" />}
            {net.state === 'error' && <p className="text-con-fg/70">Mainnet data unavailable: {net.reason}</p>}
            {net.state === 'ok' && (
              <AnimatePresence mode="wait">
                <motion.div
                  key={tab}
                  initial={{ opacity: 0, clipPath: 'inset(0 0 100% 0)' }}
                  animate={{ opacity: 1, clipPath: 'inset(0 0 0% 0)' }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
                >
                  {tab === 0 && <OverviewPane net={net.data} />}
                  {tab === 1 && <RewardsPane net={net.data} />}
                  {tab === 2 && <NetworkPane net={net.data} />}
                </motion.div>
              </AnimatePresence>
            )}
          </div>
        </div>
      </motion.div>
    </section>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl bg-card/[0.04] p-5 shadow-[inset_0_0_0_1px_#ffffff14]">
      <p className="text-[13px] text-con-fg/55">{label}</p>
      <p className="mt-2 text-[30px] font-medium tracking-[-0.03em] tnum">{value}</p>
      <p className="mt-1 text-[13px] text-con-fg/55">{sub}</p>
    </div>
  );
}

function OverviewPane({ net }: { net: Network }) {
  const next = net.rewards.expiringEras[0];
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Kpi label="Validators" value={`${net.validators.active} of ${net.validators.target}`} sub={`${net.validators.waiting} waiting`} />
      <Kpi label="Finality margin" value={`${net.finality.canFailBeforeHalt} can fail`} sub={`needs ${net.finality.threshold} of ${net.finality.authorities} to finalize`} />
      <Kpi label="Unclaimed rewards" value={`${fmtPOT(net.rewards.unclaimedGrossPOT)} POT`} sub="estimate, inside the 84-era window" />
      <Kpi label="Next era to expire" value={next ? `Era ${next.era}` : 'None this week'} sub={next ? `${fmtPOT(next.grossPOT, 1)} POT · ${new Date(next.projectedExpiryUtc).toUTCString().slice(5, 22)} UTC (projected)` : '—'} />
    </div>
  );
}

function RewardsPane({ net }: { net: Network }) {
  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between">
        <h3 className="text-[18px] font-medium">Expiring in the next 7 days</h3>
        <span className="text-[13px] text-con-fg/55">{fmtPOT(net.rewards.expiring7dPOT)} POT total · estimate</span>
      </div>
      <div className="max-h-[330px] overflow-auto rounded-xl shadow-[inset_0_0_0_1px_#ffffff14]">
        <table className="w-full text-left text-[14px]">
          <thead className="sticky top-0 bg-con text-con-fg/55"><tr><th className="px-4 py-2.5 font-normal">Era</th><th className="px-4 py-2.5 font-normal">Projected expiry (UTC)</th><th className="px-4 py-2.5 text-right font-normal">Unclaimed POT</th></tr></thead>
          <tbody className="tnum">
            {net.rewards.expiringEras.map((e) => (
              <tr key={e.era} className="border-t border-white/[0.06]">
                <td className="px-4 py-2.5">{e.era}</td>
                <td className="px-4 py-2.5 text-con-fg/75">{new Date(e.projectedExpiryUtc).toUTCString().slice(5, 22)}</td>
                <td className="px-4 py-2.5 text-right">{fmtPOT(e.grossPOT, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NetworkPane({ net }: { net: Network }) {
  const max = Math.max(...net.validators.list.map((v) => v.stakeSharePct), 1);
  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between">
        <h3 className="text-[18px] font-medium">Active validators</h3>
        <span className="text-[13px] text-con-fg/55">stake share is not voting power: each validator has one finality vote</span>
      </div>
      <div className="space-y-1.5">
        {net.validators.list.map((v) => (
          <div key={v.stash} className="grid grid-cols-[110px_1fr_70px_90px] items-center gap-3 rounded-lg px-3 py-2 text-[14px] hover:bg-card/[0.04]">
            <span className="font-mono text-con-fg/80">{v.short}</span>
            <span className="h-2 overflow-hidden rounded-full bg-card/[0.06]"><span className="block h-full rounded-full bg-gradient-to-r from-accent to-amber" style={{ width: `${Math.max(1.5, (v.stakeSharePct / max) * 100)}%` }} /></span>
            <span className="text-right tnum text-con-fg/75">{v.stakeSharePct.toFixed(2)}%</span>
            <span className={`text-right ${v.commissionPct >= 100 ? 'text-accent' : 'text-con-fg/60'}`}>{v.commissionPct}% fee</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function NominatorCheck() {
  const [addr, setAddr] = useState('');
  const [res, setRes] = useState<Load<Nominator> | null>(null);
  const check = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addr.trim()) return;
    setRes({ state: 'loading' });
    try { setRes({ state: 'ok', data: await getJson<Nominator>(`/api/nominator/${encodeURIComponent(addr.trim())}`) }); }
    catch (err) { setRes({ state: 'error', reason: (err as Error).message }); }
  };
  return (
    <section id="nominators" className="mx-auto max-w-6xl px-6 pt-32">
      <div className="grid gap-12 md:grid-cols-2">
        <div>
          <motion.h2 {...reveal} className="max-w-[14ch] text-[clamp(28px,4.6vw,60px)] [overflow-wrap:anywhere] display">Nominating? Check your stake.</motion.h2>
          <motion.p {...reveal} className="mt-5 max-w-[34ch] text-[18px] leading-relaxed text-ink/75">
            Paste a Portaldot address to see whether the validators you back are still active, what they charge, and which of your rewards expire soon. Read-only: nothing is signed.
          </motion.p>
        </div>
        <motion.div {...reveal} className="rounded-[28px] border border-line bg-card p-6 md:p-8">
          <form onSubmit={check} className="flex gap-2">
            <label htmlFor="addr" className="sr-only">Portaldot address</label>
            <input
              id="addr" value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="5F… your stash address" spellCheck={false}
              className="h-12 min-w-0 flex-1 rounded-full bg-paper px-5 font-mono text-[14px] shadow-[inset_0_0_0_1px_#1414131f] outline-none focus-visible:shadow-[inset_0_0_0_2px_#141413]"
            />
            <button type="submit" className="flex h-12 items-center gap-2 rounded-full bg-ink px-5 text-[15px] font-medium text-paper"><MagnifyingGlass size={16} />Check</button>
          </form>
          <div className="mt-6 min-h-[180px]">
            {!res && <p className="text-[15px] text-muted">Results come straight from Portaldot mainnet.</p>}
            {res?.state === 'loading' && <div className="h-40 animate-pulse rounded-2xl bg-ink/[0.04]" />}
            {res?.state === 'error' && <p className="text-[15px] text-accent">{res.reason === 'HTTP 400' ? "That doesn't look like a Portaldot address." : `Couldn't check that address: ${res.reason}`}</p>}
            {res?.state === 'ok' && <NominatorResult n={res.data} />}
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function NominatorResult({ n }: { n: Nominator }) {
  const total = n.expiring.reduce((s, e) => s + Number(e.estimatedNominatorPOT), 0);
  if (!n.targets.length) return <p className="text-[15px] text-ink/80">This address isn't nominating anyone right now.</p>;
  return (
    <div className="space-y-4 text-[15px]">
      {n.allTargetsInactive && (
        <p className="flex gap-2 rounded-2xl bg-accent/10 p-4 text-ink"><Warning size={18} className="mt-0.5 shrink-0 text-accent" />None of the validators you back is active this era, so your {fmtPOT(n.bondedPOT)} POT earns nothing. Pick an active validator.</p>
      )}
      <ul className="space-y-1.5">
        {n.targets.map((t) => (
          <li key={t.stash} className="flex items-center justify-between rounded-xl bg-paper px-4 py-2.5">
            <span className="flex items-center gap-2 font-mono text-[13px]">{t.active ? <CheckCircle size={16} className="text-emerald-700" /> : <XCircle size={16} className="text-accent" />}{t.stash.slice(0, 6)}…{t.stash.slice(-6)}</span>
            <span className="text-ink/70">{t.active ? 'active' : 'not active'} · {t.commissionPct}% fee</span>
          </li>
        ))}
      </ul>
      {n.expiring.length > 0 && (
        <p className="flex items-center gap-2 text-ink/80"><ArrowRight size={16} />About {total.toLocaleString('en-US', { maximumFractionDigits: 2 })} POT of your rewards expire in the next 7 days (estimate). Claiming from this page comes later.</p>
      )}
    </div>
  );
}

export function Footer() {
  return (
    <footer className="mx-auto mt-40 max-w-6xl border-t border-line px-6 py-10 text-[14px] text-muted">
      <p>PortalNode design lab · built for the Portaldot Hacker House 2026 · data read from wss://mainnet.portaldot.io · reward amounts are estimates using Portaldot's stake-weighted payout formula.</p>
    </footer>
  );
}

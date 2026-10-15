import { useState } from 'react';
import {
  SquaresFour, Coins, HardDrives, Graph, Key, ArrowLeft, CheckCircle, Warning, XCircle, Clock, CopySimple, Check, Info,
} from '@phosphor-icons/react';
import {
  type Attempt, type Health, type Load, type Network, type Polled, type NodeSample, type PayoutRow, type Receipt, type Rewards,
  ago, fmtPOT, keeperCall, normalizeNetwork, short, token, usePoll,
} from '../lib/api';

type View = 'overview' | 'rewards' | 'node' | 'network' | 'keeper';
const VIEWS: [View, string, typeof SquaresFour][] = [
  ['overview', 'Overview', SquaresFour], ['rewards', 'Rewards', Coins], ['node', 'Node', HardDrives],
  ['network', 'Network', Graph], ['keeper', 'Keeper', Key],
];

const utc = (iso: string) => new Date(iso).toUTCString().slice(5, 22);
const known = (v: unknown) => v !== null && v !== undefined;

function Panel({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-card/60 p-5 md:p-6">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 className="text-[15px] font-medium">{title}</h2>
        {aside && <div className="text-[13px] text-muted">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'warn' | 'ok' }) {
  return (
    <div className="rounded-2xl border border-line bg-card/60 p-5">
      <p className="text-[13px] text-muted">{label}</p>
      <p className={`mt-2 text-[28px] font-medium tracking-[-0.03em] tnum ${tone === 'warn' ? 'text-accent' : ''}`}>{value}</p>
      {sub && <p className="mt-1 text-[13px] text-muted">{sub}</p>}
    </div>
  );
}

function Fallback<T>({ load, what, children }: { load: Load<T>; what: string; children: (d: T) => React.ReactNode }) {
  if (load.state === 'loading') return <div className="h-32 animate-pulse rounded-2xl bg-ink/[0.04]" />;
  if (load.state === 'error') {
    return <p className="flex gap-2 text-[14px] text-ink/75"><Warning size={18} className="shrink-0 text-accent" />Couldn't load {what}: {load.reason}. Nothing is shown as zero when it's unknown.</p>;
  }
  return <>{children(load.data)}</>;
}

function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" aria-label={done ? 'Copied' : `Copy ${text}`} className="ml-1.5 inline-flex align-middle text-muted hover:text-ink"
      onClick={async () => { await navigator.clipboard.writeText(text).catch(() => {}); setDone(true); setTimeout(() => setDone(false), 1400); }}>
      {done ? <Check size={14} /> : <CopySimple size={14} />}
    </button>
  );
}

const STATUS: Record<string, { label: string; cls: string }> = {
  claimable: { label: 'Unclaimed', cls: 'text-ink' },
  expiring: { label: 'Expires this week', cls: 'text-accent' },
  claimed: { label: 'Claimed', cls: 'text-muted' },
  expired: { label: 'Expired', cls: 'text-faint' },
};

function eraExpiry(era: number, net: Network | null) {
  return net?.rewards.expiringEras.find((e) => e.era === era)?.projectedExpiryUtc ?? null;
}

/** One cell per era in the retained window, oldest on the left. */
function ClaimWindow({ eras, net }: { eras: PayoutRow[]; net: Network | null }) {
  const byEra = new Map(eras.map((e) => [e.era, e]));
  const from = net?.era?.claimableFrom ?? Math.min(...eras.map((e) => e.era));
  const to = net?.era ? net.era.active - 1 : Math.max(...eras.map((e) => e.era));
  const cells = Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);
  return (
    <div>
      <div className="flex h-10 gap-[2px]" role="img" aria-label={`Claim window: eras ${from} to ${to}`}>
        {cells.map((era) => {
          const s = byEra.get(era)?.status;
          const cls = s === 'claimed' ? 'bg-ink/15' : s === 'expiring' ? 'bg-accent' : s === 'claimable' ? 'bg-ink/70' : 'bg-ink/[0.06]';
          return <span key={era} title={`Era ${era}: ${s ? STATUS[s]?.label ?? s : 'no exposure'}`} className={`flex-1 rounded-[2px] ${cls}`} />;
        })}
      </div>
      <div className="mt-2 flex justify-between font-mono text-[12px] text-muted">
        <span>era {from} · expires first</span><span>era {to} · newest</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-[13px] text-ink/75">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[2px] bg-accent" />Expires this week</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[2px] bg-ink/70" />Unclaimed</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[2px] bg-ink/15" />Claimed</span>
      </div>
    </div>
  );
}

function AttemptsTable({ rows }: { rows: Attempt[] }) {
  if (!rows.length) return <p className="text-[14px] text-muted">No claims sent yet by this keeper.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[14px]">
        <thead className="text-[13px] text-muted"><tr><th className="py-2 pr-4 font-normal">Era</th><th className="py-2 pr-4 font-normal">Result</th><th className="py-2 pr-4 font-normal">Transaction</th><th className="py-2 font-normal">Block</th></tr></thead>
        <tbody className="tnum">
          {rows.map((a) => (
            <tr key={a.id} className="border-t border-line">
              <td className="py-2.5 pr-4">{a.era}</td>
              <td className="py-2.5 pr-4">
                {a.status === 'settled' && !a.error ? <span className="flex items-center gap-1.5"><CheckCircle size={16} className="text-mint" />Paid</span>
                  : a.status === 'paused' ? <span className="flex items-center gap-1.5 text-accent"><Warning size={16} />Paused: needs you</span>
                    : a.error ? <span className="flex items-center gap-1.5 text-coral"><XCircle size={16} />{a.error}</span>
                      : <span className="flex items-center gap-1.5 text-muted"><Clock size={16} />{a.status}</span>}
              </td>
              <td className="py-2.5 pr-4 font-mono text-[13px]">{a.tx_hash ? <>{short(a.tx_hash, 8)}<Copy text={a.tx_hash} /></> : '—'}</td>
              <td className="py-2.5 font-mono text-[13px]">{a.finalized_block ? <>{short(a.finalized_block, 6)} #{a.extrinsic_index}</> : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Overview({ health, net, rewards }: { health: Load<Health>; net: Load<Network>; rewards: Load<Rewards> }) {
  const h = health.state === 'ok' ? health.data : null;
  const n = net.state === 'ok' ? net.data : null;
  const r = rewards.state === 'ok' ? rewards.data : null;
  const eras = r?.validators.flatMap((v) => v.eras) ?? [];
  const open = eras.filter((e) => e.status === 'claimable' || e.status === 'expiring');
  const expiring = eras.filter((e) => e.status === 'expiring').sort((a, b) => a.era - b.era);
  const openPOT = open.reduce((s, e) => s + Number(e.estimate ?? 0), 0);
  const keeper = r?.validators[0]?.keeper;
  const node = h?.node;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Your node"
          value={!node || !known(node.reachable) ? 'Not connected' : node.syncing ? 'Syncing' : 'In sync'}
          sub={!node || !known(node.reachable) ? 'set PORTALNODE_NODE_RPC on the agent' : `${node.peers ?? '—'} peers · finalized #${node.finalized_height?.toLocaleString('en-US') ?? '—'}`} />
        <Kpi label="Keeper" value={keeper ? (keeper.enabled ? 'Claiming' : 'Off') : '—'}
          sub={h?.mode === 'observer' ? 'read-only instance' : keeper?.policy ? `max fee ${keeper.policy.maxFeePerTx} POT per claim` : 'set a fee policy to enable'} />
        <Kpi label="Unclaimed for your validators" value={r ? `${fmtPOT(String(openPOT))} POT` : '—'}
          sub={r ? `${open.length} eras · estimate` : undefined} />
        <Kpi label="Expiring this week" value={r ? `${expiring.length} eras` : '—'} tone={expiring.length ? 'warn' : undefined}
          sub={expiring[0] && n ? `first: era ${expiring[0].era}, ${eraExpiry(expiring[0].era, n) ? utc(eraExpiry(expiring[0].era, n)!) + ' UTC' : 'soon'}` : undefined} />
      </div>
      <Panel title="Your validators' claim window" aside={n ? `history depth ${n.era?.historyDepth ?? 84} eras` : undefined}>
        <Fallback load={rewards} what="rewards">
          {(d) => d.validators.length === 0
            ? <p className="text-[14px] text-muted">No validators on this keeper's allowlist yet. Add stashes with PORTALNODE_ALLOWLIST.</p>
            : <div className="space-y-6">{d.validators.map((v) => (
              <div key={v.validator}>
                <p className="mb-2 font-mono text-[13px] text-ink/80">{short(v.validator, 8)}<Copy text={v.validator} /></p>
                <ClaimWindow eras={v.eras} net={n} />
              </div>
            ))}</div>}
        </Fallback>
      </Panel>
    </div>
  );
}

function RewardsView({ rewards, receipts, net }: { rewards: Load<Rewards>; receipts: Load<Receipt[]>; net: Load<Network> }) {
  const [sel, setSel] = useState(0);
  const n = net.state === 'ok' ? net.data : null;
  return (
    <Fallback load={rewards} what="rewards">
      {(d) => {
        if (!d.validators.length) return <Panel title="Rewards"><p className="text-[14px] text-muted">No validators on the allowlist.</p></Panel>;
        const v = d.validators[Math.min(sel, d.validators.length - 1)];
        const open = v.eras.filter((e) => e.status !== 'claimed');
        return (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Validator">
              {d.validators.map((x, i) => (
                <button key={x.validator} role="tab" aria-selected={i === sel} onClick={() => setSel(i)}
                  className={`rounded-full px-4 py-2 font-mono text-[13px] ${i === sel ? 'bg-ink text-paper' : 'bg-ink/[0.06] text-ink/75 hover:bg-ink/10'}`}>{short(x.validator, 6)}</button>
              ))}
            </div>
            <Panel title="Claim window" aside={`${open.length} unclaimed eras`}><ClaimWindow eras={v.eras} net={n} /></Panel>
            <Panel title="Eras" aside="amounts are estimates until a receipt exists">
              <div className="max-h-[420px] overflow-auto">
                <table className="w-full text-left text-[14px]">
                  <thead className="sticky top-0 bg-card text-[13px] text-muted"><tr><th className="py-2 pr-4 font-normal">Era</th><th className="py-2 pr-4 font-normal">Status</th><th className="py-2 pr-4 font-normal">Projected expiry (UTC)</th><th className="py-2 text-right font-normal">Gross POT</th></tr></thead>
                  <tbody className="tnum">
                    {[...v.eras].sort((a, b) => a.era - b.era).map((e) => (
                      <tr key={`${e.era}-${e.page}`} className="border-t border-line">
                        <td className="py-2.5 pr-4">{e.era}</td>
                        <td className={`py-2.5 pr-4 ${STATUS[e.status]?.cls ?? ''}`}>{STATUS[e.status]?.label ?? e.status}</td>
                        <td className="py-2.5 pr-4 text-ink/70">{eraExpiry(e.era, n) ? utc(eraExpiry(e.era, n)!) : `after era ${e.era + (n?.era?.historyDepth ?? 84)}`}</td>
                        <td className="py-2.5 text-right">{e.paid ? fmtPOT(e.paid, 4) : e.estimate ? fmtPOT(e.estimate, 4) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
            <Panel title="Claims sent by this keeper"><AttemptsTable rows={v.recentAttempts} /></Panel>
            <Panel title="Receipts" aside="re-checked against the finalized block">
              <Fallback load={receipts} what="receipts">
                {(rs) => rs.length === 0 ? <p className="text-[14px] text-muted">No receipts yet.</p> : (
                  <ul className="space-y-2 font-mono text-[13px]">
                    {rs.map((r) => (
                      <li key={r.txHash} className="flex flex-wrap items-center gap-2">
                        {r.verified ? <CheckCircle size={16} className="text-mint" /> : <Warning size={16} className="text-accent" />}
                        {short(r.txHash, 8)}<Copy text={r.txHash} /> · block {short(r.blockHash, 6)} · extrinsic {r.extrinsicIndex}
                        {r.verified ? ` · ${r.rewardEvents} Reward events` : ` · ${r.reason}`}
                      </li>
                    ))}
                  </ul>
                )}
              </Fallback>
            </Panel>
          </div>
        );
      }}
    </Fallback>
  );
}

function NodeView({ node }: { node: Load<NodeSample> }) {
  return (
    <Panel title="Your node" aside="sampled every 15 s from the node's own RPC and metrics">
      <Fallback load={node} what="node health">
        {(s) => !known(s.reachable) ? (
          <p className="flex gap-2 text-[14px] text-ink/75"><Info size={18} className="shrink-0 text-muted" />This agent isn't connected to a local node. With the Compose install it reads the node over 127.0.0.1; on its own, set PORTALNODE_NODE_RPC and PORTALNODE_METRICS.</p>
        ) : (
          <dl className="grid gap-x-8 gap-y-4 text-[14px] sm:grid-cols-2 lg:grid-cols-4">
            {([
              ['Reachable', s.reachable ? 'Yes' : 'No'], ['Syncing', s.syncing ? 'Yes' : 'No'], ['Peers', s.peers ?? 'N/A'],
              ['Best block', s.best_height?.toLocaleString('en-US') ?? 'N/A'], ['Finalized block', s.finalized_height?.toLocaleString('en-US') ?? 'N/A'],
              ['Finality age', known(s.finality_age) ? `${Math.round(Number(s.finality_age) / 1000)} s` : 'N/A'],
              ['Heartbeat this session', known(s.heartbeat_seen) ? (s.heartbeat_seen ? 'Seen' : 'Not yet') : 'N/A'],
              ['Blocks authored this session', s.authored_count ?? 'N/A'],
            ] as [string, string | number][]).map(([k, v]) => (
              <div key={k}><dt className="text-[13px] text-muted">{k}</dt><dd className="mt-1 text-[18px] tnum">{v}</dd></div>
            ))}
          </dl>
        )}
      </Fallback>
      <p className="mt-5 text-[13px] text-muted">An online validator sends a heartbeat or authors a block each session; "not yet" early in a session isn't an outage. The agent runs on the same box, so it can't report the box itself going down.</p>
    </Panel>
  );
}

function NetworkView({ net }: { net: Load<Network> }) {
  return (
    <Fallback load={net} what="the network">
      {(n) => {
        const max = Math.max(...n.validators.list.map((v) => v.stakeSharePct), 1);
        return (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Kpi label="Validator seats" value={`${n.validators.active} of ${n.validators.target}`} sub={`${n.validators.waiting} waiting`} />
              <Kpi label="Finality margin" value={`${n.finality.canFailBeforeHalt} can fail`} sub={`needs ${n.finality.threshold} of ${n.finality.authorities} votes`} />
              <Kpi label="Largest stake" value={`${n.concentration.top1Pct.toFixed(1)}%`} sub="one finality vote, like every validator" tone="warn" />
            </div>
            <Panel title="Active validators" aside={`block #${n.block.height.toLocaleString('en-US')} · ${ago(n.computedAt)}`}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-[14px]">
                  <thead className="text-[13px] text-muted"><tr><th className="py-2 pr-4 font-normal">Stash</th><th className="py-2 pr-4 font-normal">Stake share</th><th className="py-2 pr-4 text-right font-normal">Fee</th><th className="py-2 pr-4 text-right font-normal">Nominators</th><th className="py-2 font-normal">Identity</th></tr></thead>
                  <tbody className="tnum">
                    {n.validators.list.map((v) => (
                      <tr key={v.stash} className="border-t border-line">
                        <td className="py-2.5 pr-4 font-mono text-[13px]">{v.short}<Copy text={v.stash} /></td>
                        <td className="py-2.5 pr-4"><span className="flex items-center gap-3"><span className="h-1.5 w-28 overflow-hidden rounded-full bg-ink/10"><span className="block h-full rounded-full bg-accent" style={{ width: `${Math.max(2, (v.stakeSharePct / max) * 100)}%` }} /></span>{v.stakeSharePct.toFixed(2)}%</span></td>
                        <td className={`py-2.5 pr-4 text-right ${v.commissionPct >= 100 ? 'text-accent' : ''}`}>{v.commissionPct}%</td>
                        <td className="py-2.5 pr-4 text-right">{v.nominators}</td>
                        <td className="py-2.5 text-muted">{v.hasIdentity ? 'Set' : 'None'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>
        );
      }}
    </Fallback>
  );
}

function KeeperView({ health, rewards }: { health: Load<Health>; rewards: Polled<Rewards> }) {
  const [tok, setTok] = useState(token.get());
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [policy, setPolicy] = useState({ maxFeePerTx: '', budget24h: '', minReserve: '' });
  const observer = health.state === 'ok' && health.data.mode === 'observer';
  const status = rewards.state === 'ok' ? rewards.data.validators[0]?.keeper : undefined;
  const act = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg({ ok: true, text: done }); rewards.reload(); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    setBusy(false);
  };
  const btn = 'rounded-full px-5 py-2.5 text-[14px] font-medium disabled:opacity-40';
  return (
    <div className="space-y-4">
      {observer && (
        <p className="flex gap-2 rounded-2xl border border-line bg-card/60 p-5 text-[14px] text-ink/80"><Info size={18} className="shrink-0 text-muted" />This instance is read-only. Keeper controls only exist on an operator's own box, behind its console token.</p>
      )}
      <Panel title="Keeper" aside={status ? (status.enabled ? 'claiming' : 'off') : undefined}>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <label className="block text-[13px] text-muted" htmlFor="tok">Console token (kept for this browser tab only)</label>
            <input id="tok" type="password" value={tok} onChange={(e) => setTok(e.target.value)} onBlur={() => token.set(tok)} autoComplete="off"
              className="h-11 w-full rounded-xl bg-paper px-4 font-mono text-[14px] shadow-[inset_0_0_0_1px_var(--color-line)] outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--color-accent)]" />
            <div className="flex flex-wrap gap-2">
              <button className={`${btn} bg-ink text-paper`} disabled={busy || observer} onClick={() => { token.set(tok); act(() => keeperCall('/api/keeper/enable', 'POST'), 'Keeper is on. It claims each allowlisted era when it becomes claimable.'); }}>Turn on</button>
              <button className={`${btn} bg-ink/[0.08]`} disabled={busy || observer} onClick={() => { token.set(tok); act(() => keeperCall('/api/keeper/disable', 'POST'), 'Keeper is off. Nothing will be signed.'); }}>Turn off</button>
              <button className={`${btn} bg-ink/[0.08]`} disabled={busy || observer} onClick={() => { token.set(tok); act(() => keeperCall('/api/keeper/claim-now', 'POST'), 'Claim pass finished. See Rewards for the result.'); }}>Claim now</button>
            </div>
          </div>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); token.set(tok); act(() => keeperCall('/api/keeper/policy', 'PUT', policy), 'Fee policy saved until the agent restarts.'); }}>
            <p className="text-[13px] text-muted">Fee policy (POT). The keeper signs nothing until all three are set.</p>
            {([['maxFeePerTx', 'Max fee per claim'], ['budget24h', 'Budget per 24 hours'], ['minReserve', 'Keep at least this balance']] as const).map(([k, label]) => (
              <label key={k} className="flex items-center justify-between gap-3 text-[14px]">
                <span className="text-ink/80">{label}</span>
                <input inputMode="decimal" value={policy[k]} placeholder={status?.policy?.[k] ?? ''} onChange={(e) => setPolicy({ ...policy, [k]: e.target.value })}
                  className="h-10 w-36 rounded-xl bg-paper px-3 text-right font-mono text-[14px] shadow-[inset_0_0_0_1px_var(--color-line)] outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--color-accent)]" />
              </label>
            ))}
            <button className={`${btn} bg-ink/[0.08]`} disabled={busy || observer}>Save policy</button>
          </form>
        </div>
        {msg && <p className={`mt-5 flex gap-2 text-[14px] ${msg.ok ? 'text-ink/85' : 'text-accent'}`} aria-live="polite">{msg.ok ? <CheckCircle size={18} className="shrink-0 text-mint" /> : <Warning size={18} className="shrink-0" />}{msg.text}</p>}
      </Panel>
      <Panel title="What the keeper will and won't do">
        <ul className="space-y-2 text-[14px] text-ink/80">
          <li>Claims only for the validators on its allowlist, one era per transaction, one transaction at a time.</li>
          <li>Signs with its own small key. Your stash and controller keys never touch this box.</li>
          <li>Stops and asks you when a result is ambiguous, instead of guessing and resending.</li>
          <li>The fee limits are checks in this app, not a cap on the chain: keep the keeper's balance small.</li>
        </ul>
      </Panel>
    </div>
  );
}

export default function Console() {
  const [view, setView] = useState<View>(() => (VIEWS.find(([v]) => location.hash === `#${v}`)?.[0] ?? 'overview'));
  const go = (v: View) => { setView(v); history.replaceState(null, '', `#${v}`); };
  const health = usePoll<Health>('/api/health', 15_000);
  const net = usePoll<Network>('/api/network', 60_000, normalizeNetwork);
  const rewards = usePoll<Rewards>('/api/rewards', 30_000);
  const receipts = usePoll<Receipt[]>('/api/receipts', 60_000);
  const node = usePoll<NodeSample>('/api/node', 15_000);
  const n = net.state === 'ok' ? net.data : null;

  return (
    <div className="min-h-screen md:grid md:grid-cols-[232px_1fr]">
      <aside className="border-b border-line p-5 md:sticky md:top-0 md:h-screen md:border-r md:border-b-0">
        <a href="/" className="flex items-center gap-2 font-mono text-[14px] tracking-[0.12em] uppercase"><ArrowLeft size={14} />portal<span className="text-accent">node</span></a>
        <nav className="mt-6 flex gap-1 overflow-x-auto md:flex-col" aria-label="Console">
          {VIEWS.map(([v, label, Icon]) => (
            <button key={v} onClick={() => go(v)} aria-current={view === v ? 'page' : undefined}
              className={`flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-[14px] ${view === v ? 'bg-ink/[0.08] text-ink' : 'text-ink/60 hover:text-ink'}`}>
              <Icon size={18} />{label}
            </button>
          ))}
        </nav>
      </aside>
      <main className="min-w-0 p-5 md:p-8">
        <header className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="display text-[clamp(28px,3vw,40px)]">{VIEWS.find(([v]) => v === view)![1]}</h1>
          <p className="font-mono text-[13px] text-muted">
            {health.state === 'ok' ? `${health.data.mode} · ` : ''}{n ? `Portaldot mainnet #${n.block.height.toLocaleString('en-US')} · runtime ${n.runtime?.split(':')[2] ?? '—'}` : 'reading the chain…'}
          </p>
        </header>
        {view === 'overview' && <Overview health={health} net={net} rewards={rewards} />}
        {view === 'rewards' && <RewardsView rewards={rewards} receipts={receipts} net={net} />}
        {view === 'node' && <NodeView node={node} />}
        {view === 'network' && <NetworkView net={net} />}
        {view === 'keeper' && <KeeperView health={health} rewards={rewards} />}
      </main>
    </div>
  );
}

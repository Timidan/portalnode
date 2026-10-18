import { useState } from 'react';
import {
  SquaresFour, Coins, HardDrives, Graph, Key, ArrowLeft, CheckCircle, Warning, XCircle, Clock, CopySimple, Check, Info,
  Wrench, ArrowSquareOut,
} from '@phosphor-icons/react';
import {
  type Attempt, type Health, type Load, type Network, type Polled, type NodeSample, type PayoutRow, type Receipt, type Rewards,
  type Built, type KeyPart, type Preflight, type Rotated, type WizardStatus,
  ago, chainOf, fmtPOT, getJson, keeperCall, normalizeNetwork, short, token, usePoll,
} from '../lib/api';
import { Network as NetworkMark, Token } from '../components/brand';
import type { Liveness } from '../lib/api';
import { DiscordLogo, TelegramLogo } from '@phosphor-icons/react';
import type { Alerts, ChannelResult } from '../lib/api';

type View = 'overview' | 'rewards' | 'node' | 'network' | 'keeper' | 'setup';
const VIEWS: [View, string, typeof SquaresFour][] = [
  ['overview', 'Overview', SquaresFour], ['rewards', 'Rewards', Coins], ['node', 'Node', HardDrives],
  ['network', 'Network', Graph], ['keeper', 'Keeper', Key], ['setup', 'Setup', Wrench],
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

function Kpi({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: string; tone?: 'warn' | 'ok' }) {
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
  const { unit } = chainOf(n?.genesis);
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
          value={!node || !known(node.reachable) ? 'Public RPC only' : node.syncing ? 'Syncing' : 'In sync'}
          sub={!node || !known(node.reachable) ? 'no local node attached; the keeper still works' : `${node.peers ?? '—'} peers · finalized #${node.finalized_height?.toLocaleString('en-US') ?? '—'}`} />
        <Kpi label="Keeper" value={keeper ? (keeper.enabled ? 'Claiming' : 'Off') : '—'}
          sub={h?.mode === 'observer' ? 'read-only instance' : keeper?.policy ? `max fee ${keeper.policy.maxFeePerTx} ${unit} per claim` : 'set a fee policy to enable'} />
        <Kpi label="Unclaimed for your validators" value={r ? <Token value={fmtPOT(String(openPOT))} genesis={n?.genesis} /> : '—'}
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
  const { unit } = chainOf(n?.genesis);
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
                  <thead className="sticky top-0 bg-card text-[13px] text-muted"><tr><th className="py-2 pr-4 font-normal">Era</th><th className="py-2 pr-4 font-normal">Status</th><th className="py-2 pr-4 font-normal">Projected expiry (UTC)</th><th className="py-2 text-right font-normal"><span className="inline-flex items-center gap-1.5"><img src="/brand/pot.png" alt="" className="h-3.5 w-3.5" />Gross {unit}</span></th></tr></thead>
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
        {(s) => (<>
          {!known(s.reachable) ? (
            <p className="flex gap-2 text-[14px] text-ink/75"><Info size={18} className="shrink-0 text-muted" />This agent isn't connected to a local node. With the Compose install it reads the node over 127.0.0.1; on its own, set PORTALNODE_NODE_RPC and PORTALNODE_METRICS.</p>
          ) : (
            <dl className="grid gap-x-8 gap-y-4 text-[14px] sm:grid-cols-2 lg:grid-cols-4">
              {([
                ['Reachable', s.reachable ? 'Yes' : 'No'], ['Syncing', s.syncing ? 'Yes' : 'No'], ['Peers', s.peers ?? 'N/A'],
                ['Best block', s.best_height?.toLocaleString('en-US') ?? 'N/A'], ['Finalized block', s.finalized_height?.toLocaleString('en-US') ?? 'N/A'],
                ['Finality age', known(s.finality_age) ? `${s.finality_age} s` : 'N/A'],
                ['Online this session', known(s.authored_count) ? (s.heartbeat_seen || Number(s.authored_count) > 0 ? 'Yes' : 'Not yet') : 'N/A'],
                ['Blocks authored this session', s.authored_count ?? 'N/A'],
              ] as [string, string | number][]).map(([k, v]) => (
                <div key={k}><dt className="text-[13px] text-muted">{k}</dt><dd className="mt-1 text-[18px] tnum">{v}</dd></div>
              ))}
            </dl>
          )}
          {!!s.keysLoaded?.length && (
            <div className="mt-6">
              <p className="text-[13px] text-muted">Session keys on this node, per allowlisted validator</p>
              <ul className="mt-2 space-y-2 text-[14px]">
                {s.keysLoaded.map((k) => (
                  <li key={k.stash} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-mono text-[13px]">{short(k.stash, 8)}<Copy text={k.stash} /></span>
                    {k.loaded === true ? <span className="flex items-center gap-1.5"><CheckCircle size={16} className="text-mint" />Loaded</span>
                      : k.loaded === false ? <span className="flex items-center gap-1.5 text-coral"><XCircle size={16} />Not loaded: this node doesn't hold the keys set on chain</span>
                        : <span className="flex items-center gap-1.5 text-muted"><Info size={16} />Unknown: {k.reason}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>)}
      </Fallback>
      <p className="mt-5 text-[13px] text-muted">An online validator sends a heartbeat or authors a block each session; "not yet" early in a session isn't an outage. The agent runs on the same box, so it can't report the box itself going down.</p>
    </Panel>
  );
}

function NetworkView({ net, live }: { net: Load<Network>; live: Load<Liveness> }) {
  const l = live.state === 'ok' ? live.data : null;
  const rows = new Map(l?.validators.map((r) => [r.stash, r]));
  return (
    <Fallback load={net} what="the network">
      {(n) => {
        const max = Math.max(...n.validators.list.map((v) => v.stakeSharePct), 1);
        return (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Kpi label="Validator seats" value={`${n.validators.active} of ${n.validators.target}`} sub={`${n.validators.waiting} waiting`} />
              <Kpi label="Finality margin" value={`${n.finality.canFailBeforeHalt} can fail`} sub={`needs ${n.finality.threshold} of ${n.finality.authorities} votes`} />
              <Kpi label="Largest stake" value={n.concentration.top1Pct === null ? '—' : `${n.concentration.top1Pct.toFixed(1)}%`} sub="one finality vote, like every validator" tone="warn" />
            </div>
            <Panel title="Active validators" aside={`block #${n.block.height.toLocaleString('en-US')} · ${ago(n.computedAt)}`}>
              {l?.validators.filter((r) => r.atRisk).map((r) => (
                <p key={r.stash} className="mb-4 flex gap-2 text-[14px] text-accent"><Warning size={18} className="shrink-0" />
                  {short(r.stash)} has authored no block and sent no heartbeat in session {l.session}, and the heartbeat point (block #{l.heartbeatAfter.toLocaleString('en-US')}) has passed. Unless it does one of these before the session ends{l.blocksLeftInSession !== null ? `, in about ${l.blocksLeftInSession} blocks` : ''}, it will be reported offline.</p>
              ))}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-[14px]">
                  <thead className="text-[13px] text-muted"><tr><th className="py-2 pr-4 font-normal">Stash</th><th className="py-2 pr-4 font-normal">Stake share</th><th className="py-2 pr-4 text-right font-normal">Fee</th><th className="py-2 pr-4 text-right font-normal">Nominators</th><th className="py-2 pr-4 font-normal">Online</th><th className="py-2 pr-4 text-right font-normal">Blocks this session</th><th className="py-2 pr-4 text-right font-normal">Era points</th><th className="py-2 font-normal">Identity</th></tr></thead>
                  <tbody className="tnum">
                    {n.validators.list.map((v) => {
                      const r = rows.get(v.stash);
                      return (
                        <tr key={v.stash} className="border-t border-line">
                          <td className="py-2.5 pr-4 font-mono text-[13px]">{v.short}<Copy text={v.stash} /></td>
                          <td className="py-2.5 pr-4"><span className="flex items-center gap-3"><span className="h-1.5 w-28 overflow-hidden rounded-full bg-ink/10"><span className="block h-full rounded-full bg-accent" style={{ width: `${Math.max(2, (v.stakeSharePct / max) * 100)}%` }} /></span>{v.stakeSharePct.toFixed(2)}%</span></td>
                          <td className={`py-2.5 pr-4 text-right ${v.commissionPct >= 100 ? 'text-accent' : ''}`}>{v.commissionPct}%</td>
                          <td className="py-2.5 pr-4 text-right">{v.nominators}</td>
                          <td className="py-2.5 pr-4">{!r || r.isOnline === null ? '—'
                            : r.isOnline ? <span className="flex items-center gap-1.5"><CheckCircle size={16} className="text-mint" />{r.authoredBlocks ? 'Yes' : 'Yes, heartbeat'}</span>
                              : r.atRisk ? <span className="flex items-center gap-1.5 text-accent"><Warning size={16} />At risk</span>
                                : <span className="flex items-center gap-1.5 text-muted"><Clock size={16} />Not yet</span>}</td>
                          <td className="py-2.5 pr-4 text-right">{r ? r.authoredBlocks.toLocaleString('en-US') : '—'}</td>
                          <td className="py-2.5 pr-4 text-right">{r?.eraPoints?.toLocaleString('en-US') ?? '—'}</td>
                          <td className="py-2.5 text-muted">{v.hasIdentity ? 'Set' : 'None'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-4 text-[13px] text-muted">
                {l ? `Online, blocks and era points read at block #${l.block.height.toLocaleString('en-US')}, session ${l.session}${l.blocksLeftInSession !== null ? `, about ${l.blocksLeftInSession} blocks left` : ''}. A validator counts as online for the session once it authors a block or sends a heartbeat.`
                  : live.state === 'error' ? `Liveness unavailable: ${live.reason}` : 'Reading liveness…'}
              </p>
            </Panel>
          </div>
        );
      }}
    </Fallback>
  );
}

function KeeperView({ health, rewards, unit }: { health: Load<Health>; rewards: Polled<Rewards>; unit: string }) {
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
  const alerts = usePoll<Alerts>('/api/alerts', 30_000);
  const [tested, setTested] = useState<{ ok: boolean; text: string } | null>(null);
  const channelsOn = alerts.state === 'ok' && (alerts.data.channels.telegram || alerts.data.channels.discord);
  const sendTest = async () => {
    token.set(tok); setBusy(true); setTested(null);
    try {
      const r: ChannelResult = await keeperCall('/api/alerts/test', 'POST');
      const all = Object.entries(r);
      setTested({ ok: all.every(([, v]) => v.ok), text: all.map(([k, v]) => `${k === 'telegram' ? 'Telegram' : 'Discord'}: ${v.ok ? 'sent' : v.error}`).join(' · ') });
    } catch (e) { setTested({ ok: false, text: (e as Error).message }); }
    setBusy(false);
  };
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
            <p className="text-[13px] text-muted">Fee policy ({unit}). The keeper signs nothing until all three are set.</p>
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
      <Panel title="Alerts" aside="one message when a problem starts, one when it clears">
        <div className="flex flex-wrap items-center gap-2">
          {([['telegram', 'Telegram', TelegramLogo], ['discord', 'Discord', DiscordLogo]] as const).map(([k, label, Icon]) => {
            const on = alerts.state === 'ok' && alerts.data.channels[k];
            return (
              <span key={k} className={`flex items-center gap-2 rounded-full px-4 py-2 text-[14px] ${on ? 'bg-ink/[0.08] text-ink' : 'text-muted shadow-[inset_0_0_0_1px_var(--color-line)]'}`}>
                <Icon size={18} weight={on ? 'fill' : 'regular'} />{label}{on ? '' : ': not set'}
              </span>
            );
          })}
          <button className={`${btn} bg-ink/[0.08] sm:ml-auto`} disabled={busy || observer || !channelsOn} onClick={sendTest}>Send test alert</button>
        </div>
        {alerts.state === 'ok' && !channelsOn && <p className="mt-4 text-[13px] text-muted">Set PORTALNODE_TELEGRAM_BOT_TOKEN and PORTALNODE_TELEGRAM_CHAT_ID, or PORTALNODE_DISCORD_WEBHOOK, on the agent and restart it.</p>}
        {tested && <p className={`mt-4 flex gap-2 text-[14px] ${tested.ok ? 'text-ink/85' : 'text-accent'}`} aria-live="polite">{tested.ok ? <CheckCircle size={18} className="shrink-0 text-mint" /> : <Warning size={18} className="shrink-0" />}{tested.text}</p>}
        <div className="mt-5">
          <Fallback load={alerts} what="alerts">
            {(d) => d.alerts.length === 0 ? <p className="text-[14px] text-muted">No alerts yet.</p> : (
              <ul className="divide-y divide-line text-[14px]">
                {d.alerts.slice(0, 15).map((a) => {
                  const failed = Object.entries(a.delivery?.result ?? {}).filter(([, r]) => !r.ok);
                  return (
                    <li key={a.key} className="flex gap-3 py-3">
                      {a.resolved ? <CheckCircle size={18} className="mt-0.5 shrink-0 text-mint" /> : a.severity === 'info' ? <Info size={18} className="mt-0.5 shrink-0 text-muted" /> : <Warning size={18} className={`mt-0.5 shrink-0 ${a.severity === 'critical' ? 'text-coral' : 'text-accent'}`} />}
                      <div className="min-w-0 flex-1">
                        <p className={a.resolved ? 'text-ink/60' : 'text-ink/90'}>{a.message}</p>
                        {a.evidence && <p className="mt-0.5 font-mono text-[12px] break-all text-muted">{a.evidence}</p>}
                        {failed.length > 0 && <p className="mt-0.5 text-[12px] text-accent">Not delivered: {failed.map(([k, r]) => `${k} ${r.error}`).join(' · ')}</p>}
                      </div>
                      <p className="shrink-0 text-right text-[13px] text-muted">{a.resolved ? 'recovered' : a.severity}<br /><span title={a.lastSeen}>{ago(Date.parse(a.lastSeen))}</span></p>
                    </li>
                  );
                })}
              </ul>
            )}
          </Fallback>
        </div>
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

const field = 'w-full rounded-xl bg-paper px-4 font-mono text-[14px] shadow-[inset_0_0_0_1px_var(--color-line)] outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--color-accent)]';
const Mark = ({ ok }: { ok: boolean | null }) => ok === true ? <CheckCircle size={18} className="shrink-0 text-mint" />
  : ok === false ? <XCircle size={18} className="shrink-0 text-coral" /> : <Info size={18} className="shrink-0 text-muted" />;

function KeyList({ parts }: { parts: KeyPart[] }) {
  return (
    <ul className="mt-5 space-y-1.5 font-mono text-[13px]">
      {parts.map((k) => (
        <li key={k.keyTypeId} className="flex flex-wrap gap-x-3"><span className="w-48 text-muted">{k.type} · {k.keyTypeId}</span>{short(k.publicKey, 10)}<Copy text={k.publicKey} /></li>
      ))}
    </ul>
  );
}

function SetupView({ health }: { health: Load<Health> }) {
  const observer = health.state === 'ok' && health.data.mode === 'observer';
  const [stash, setStash] = useState('');
  const [tok, setTok] = useState(token.get());
  const [pre, setPre] = useState<Preflight | null>(null);
  const [keys, setKeys] = useState('');
  const [proof, setProof] = useState('');
  const [rotated, setRotated] = useState<KeyPart[] | null>(null);
  const [bond, setBond] = useState('');
  const [commission, setCommission] = useState('5');
  const [built, setBuilt] = useState<Built | null>(null);
  const [st, setSt] = useState<WizardStatus | null>(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState<{ step: string; text: string } | null>(null);
  const run = async (step: string, fn: () => Promise<void>) => {
    setBusy(step); setErr(null);
    try { await fn(); } catch (e) { setErr({ step, text: (e as Error).message }); }
    setBusy('');
  };
  const fail = (step: string) => err?.step === step && (
    <p className="mt-4 flex gap-2 text-[14px] text-accent" aria-live="polite"><Warning size={18} className="shrink-0" />{err.text}</p>
  );
  const btn = 'rounded-full px-5 py-2.5 text-[14px] font-medium disabled:opacity-40';
  const unit = pre?.network.unit ?? 'POT';
  const loopback = built && /^wss?:\/\/(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(built.rpc);
  const preRows: [string, string, string?][] = pre ? [
    ['Network', pre.network.name, `${pre.network.runtime} · finalized #${pre.network.block.toLocaleString('en-US')}`],
    ['Your node', !pre.node.attached ? 'Not attached' : pre.node.reachable ? (pre.node.syncing ? 'Syncing' : 'In sync') : 'Not answering',
      pre.node.attached ? `${pre.node.peers ?? '—'} peers · finalized #${pre.node.finalized?.toLocaleString('en-US') ?? '—'}` : 'keys can only be generated on an attached node'],
    ['Stash', pre.bonded ? `Bonded, ${fmtPOT(pre.activePOT ?? '0', 4)} ${unit}` : 'Not bonded yet',
      pre.candidate ? 'already a validator candidate' : pre.bonded ? (pre.controller !== pre.stash ? `controller ${short(pre.controller ?? '')} signs` : 'the batch will skip bond') : undefined],
    ['Validator bond', pre.bounds.maxPOT ? `${fmtPOT(pre.bounds.minPOT)}–${fmtPOT(pre.bounds.maxPOT)} ${unit}` : `at least ${fmtPOT(pre.bounds.minPOT, 4)} ${unit}`,
      pre.bounds.problem ?? 'checked again when you build'],
    ['Seats', `${pre.seats.active} of ${pre.seats.seats} filled`, `${pre.seats.candidates} candidates`],
    ['Unbonding period', `${pre.bonding.eras} eras`, pre.bonding.days === null ? undefined : `about ${pre.bonding.days} days`],
    ['Session keys', `${pre.sessionKeys.types.length} keys, ${pre.sessionKeys.bytes} bytes`,
      `${pre.sessionKeys.types.join(', ')}${pre.sessionKeys.proofRequired ? ' · needs an ownership proof' : ''}`],
    ['Free balance', `${fmtPOT(pre.freePOT, 4)} ${unit}`],
    ['Estimated fee', `${pre.feeEstimatePOT} ${unit}`, 'for the whole batch'],
  ] : [];
  return (
    <div className="space-y-4">
      <Panel title="1. Preflight" aside="read-only checks at the finalized block">
        <form className="flex flex-wrap gap-2" onSubmit={(e) => {
          e.preventDefault();
          run('preflight', async () => {
            const p = await getJson<Preflight>(`/api/wizard/preflight?stash=${encodeURIComponent(stash.trim())}`);
            setPre(p); setBuilt(null); setSt(null);
            if (!p.bonded) setBond(p.bounds.minPOT);
          });
        }}>
          <label className="sr-only" htmlFor="stash">Stash address</label>
          <input id="stash" value={stash} onChange={(e) => setStash(e.target.value)} placeholder="Stash address (SS58)" autoComplete="off" spellCheck={false}
            className={`${field} h-11 min-w-0 flex-1`} />
          <button className={`${btn} bg-ink text-paper`} disabled={busy !== '' || !stash.trim()}>{busy === 'preflight' ? 'Checking…' : 'Check'}</button>
        </form>
        {fail('preflight')}
        {pre && (<>
          <dl className="mt-6 grid gap-x-8 gap-y-4 text-[14px] sm:grid-cols-2 lg:grid-cols-3">
            {preRows.map(([k, v, sub]) => (
              <div key={k}><dt className="text-[13px] text-muted">{k}</dt><dd className="mt-1 text-[16px] tnum">{v}</dd>{sub && <dd className="mt-0.5 text-[13px] text-muted">{sub}</dd>}</div>
            ))}
          </dl>
          {pre.warnings.length > 0 && (
            <ul className="mt-5 space-y-2 text-[14px]">
              {pre.warnings.map((w) => <li key={w} className="flex gap-2 text-accent"><Warning size={18} className="shrink-0" />{w}</li>)}
            </ul>
          )}
        </>)}
      </Panel>

      <Panel title="2. Session keys" aside="made on the node that will run them">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-3">
            <p className="text-[14px] text-ink/80">Ask your node for new keys. The private keys stay in its keystore; only the public keys come back.</p>
            <label className="block text-[13px] text-muted" htmlFor="wtok">Console token (kept for this browser tab only)</label>
            <input id="wtok" type="password" value={tok} onChange={(e) => setTok(e.target.value)} onBlur={() => token.set(tok)} autoComplete="off" className={`${field} h-11`} />
            <button className={`${btn} bg-ink text-paper`} disabled={busy !== '' || observer || !pre} onClick={() => run('keys', async () => {
              token.set(tok);
              const r: Rotated = await keeperCall('/api/wizard/rotate-keys', 'POST', { stash: pre!.stash });
              setKeys(r.keys); setProof(r.proof === '0x' ? '' : r.proof); setRotated(r.decoded); setBuilt(null);
            })}>{busy === 'keys' ? 'Generating…' : 'Generate keys on my node'}</button>
            {observer && <p className="text-[13px] text-muted">This instance is read-only. Key generation only exists on an operator's own box, behind its console token.</p>}
          </div>
          <div className="space-y-3">
            <label className="block text-[13px] text-muted" htmlFor="wkeys">Or paste the keys your node returned (author_rotateKeys)</label>
            <textarea id="wkeys" rows={4} value={keys} onChange={(e) => { setKeys(e.target.value); setRotated(null); setBuilt(null); }} spellCheck={false}
              className={`${field} py-3 break-all`} />
            {pre?.sessionKeys.proofRequired && (<>
              <label className="block text-[13px] text-muted" htmlFor="wproof">Ownership proof (this runtime checks that the signer holds the keys)</label>
              <textarea id="wproof" rows={3} value={proof} onChange={(e) => { setProof(e.target.value); setBuilt(null); }} spellCheck={false} className={`${field} py-3 break-all`} />
            </>)}
          </div>
        </div>
        {fail('keys')}
        {rotated && <KeyList parts={rotated} />}
      </Panel>

      <Panel title="3. Bond and commission">
        <form className="flex flex-wrap items-end gap-4" onSubmit={(e) => {
          e.preventDefault();
          run('build', async () => {
            const b: Built = await keeperCall('/api/wizard/build', 'POST', {
              stash: pre!.stash, bondPOT: bond, commissionPct: commission, keys: keys.trim(), proof: proof.trim() || undefined,
            });
            setBuilt(b); setSt(null);
          });
        }}>
          <label className="text-[13px] text-muted">Bond ({unit})
            <input inputMode="decimal" value={pre?.bonded ? pre.activePOT ?? '' : bond} disabled={pre?.bonded} onChange={(e) => setBond(e.target.value)}
              className={`${field} mt-1.5 block h-10 w-44 text-right disabled:opacity-60`} />
          </label>
          <label className="text-[13px] text-muted">Commission (%)
            <input inputMode="decimal" value={commission} onChange={(e) => setCommission(e.target.value)} className={`${field} mt-1.5 block h-10 w-28 text-right`} />
          </label>
          <button className={`${btn} bg-ink text-paper`} disabled={busy !== '' || !pre || !keys.trim()}>{busy === 'build' ? 'Building…' : 'Build the call'}</button>
        </form>
        <p className="mt-4 text-[13px] text-muted">
          One utility.batchAll: {pre?.bonded ? '' : 'staking.bond (rewards restaked), '}session.setKeys, staking.validate. If any part fails, none of it applies.
          {pre?.bonded && ' The stash is already bonded, so the batch keeps its current bond.'}
        </p>
        {fail('build')}
      </Panel>

      <Panel title="4. Sign" aside="in Portaldot Node Console, with your wallet extension">
        {!built ? <p className="text-[14px] text-muted">Build the call first. PortalNode never sees your stash key: it builds the call, you sign it.</p> : (<>
          <dl className="grid gap-x-8 gap-y-4 text-[14px] sm:grid-cols-3">
            <div><dt className="text-[13px] text-muted">Signer</dt><dd className="mt-1 font-mono text-[14px]">{short(built.signer, 8)}<Copy text={built.signer} /></dd><dd className="text-[13px] text-muted">the {built.signerRole}</dd></div>
            <div><dt className="text-[13px] text-muted">Estimated fee</dt><dd className="mt-1 text-[16px] tnum">{built.feePOT} {built.unit}</dd></div>
            <div><dt className="text-[13px] text-muted">Keys on your node</dt><dd className="mt-1 flex gap-2 text-[14px]"><Mark ok={built.keysOnNode.loaded} />
              {built.keysOnNode.loaded === true ? 'Yes' : built.keysOnNode.loaded === false ? 'No' : `Unknown: ${built.keysOnNode.reason}`}</dd></div>
          </dl>
          <ol className="mt-5 space-y-3">
            {built.calls.map((c, i) => (
              <li key={i} className="rounded-xl bg-ink/[0.04] p-4">
                <p className="font-mono text-[14px]">{i + 1}. {c.pallet}.{c.method}</p>
                <pre className="mt-2 font-mono text-[12px] break-all whitespace-pre-wrap text-ink/75">{JSON.stringify(c.args, null, 1)}</pre>
              </li>
            ))}
          </ol>
          {built.warnings.map((w) => <p key={w} className="mt-4 flex gap-2 text-[14px] text-accent"><Warning size={18} className="shrink-0" />{w}</p>)}
          <div className="mt-5">
            {built.keysOnNode.loaded === false ? (
              <p className="flex gap-2 text-[14px] text-coral"><XCircle size={18} className="shrink-0" />These keys aren't in your node's keystore. If this validator were elected, no running node could produce its blocks, and a small chain can halt. Generate the keys on your node instead.</p>
            ) : (
              <a href={built.deepLink} target="_blank" rel="noreferrer" className={`${btn} inline-flex items-center gap-2 bg-ink text-paper`}><ArrowSquareOut size={16} />Sign in Portaldot Node Console</a>
            )}
          </div>
          <p className="mt-4 text-[13px] text-muted">
            The link opens the console's Decode tab with this call, connected to {built.rpc}. Then open the Submission tab, choose {short(built.signer)}, press Submit Transaction and sign in the Portaldot extension.
            {loopback && ' This address is local: the console reaches it only if this browser can, and some browsers block a public site from opening a local address. If it can\'t connect, paste the call data into Decode on a console that can reach your node.'}
          </p>
          <p className="mt-4 text-[13px] text-muted">Call data<Copy text={built.callHex} /></p>
          <p className="mt-1 max-h-28 overflow-auto font-mono text-[12px] break-all text-ink/70">{built.callHex}</p>
        </>)}
      </Panel>

      <Panel title="5. Verify" aside="keys take effect two sessions after they are set">
        <button className={`${btn} bg-ink/[0.08]`} disabled={busy !== '' || !pre} onClick={() => run('status', async () => {
          setSt(await getJson<WizardStatus>(`/api/wizard/status?stash=${encodeURIComponent(pre!.stash)}${keys.trim() ? `&keys=${encodeURIComponent(keys.trim())}` : ''}`));
        })}>{busy === 'status' ? 'Checking…' : 'Check status'}</button>
        {fail('status')}
        {st && (
          <ul className="mt-5 space-y-2 text-[14px]">
            {([
              [st.bonded, st.bonded ? `Bonded: ${fmtPOT(st.activePOT ?? '0', 4)} ${unit}` : 'Not bonded'],
              [st.candidate, st.candidate ? `Validator candidate, ${st.commissionPct}% commission` : 'Not a validator candidate'],
              [st.nextKeys ? st.matchesSubmitted !== false : false, !st.nextKeys ? 'No session keys set on chain' : st.matchesSubmitted === false ? 'The session keys on chain differ from the ones above' : 'Session keys set on chain'],
              [st.keysOnNode.loaded, st.keysOnNode.loaded === true ? 'Your node holds the keys set on chain' : st.keysOnNode.loaded === false ? "Your node doesn't hold the keys set on chain" : `Can't tell whether your node holds the keys: ${st.keysOnNode.reason}`],
              [st.queued || null, st.queued ? 'Queued: active from the next session' : 'Not queued for the next session'],
              [st.active || null, st.active ? 'Active validator this session' : 'Not active this session'],
            ] as [boolean | null, string][]).map(([ok, text]) => <li key={text} className="flex gap-2"><Mark ok={ok} />{text}</li>)}
          </ul>
        )}
        <p className="mt-4 text-[13px] text-muted">
          {st && `Read at finalized block #${st.block.toLocaleString('en-US')}, session ${st.session}. `}
          A candidate is elected only if it wins a seat; its keys are queued at the next session and active the one after. PortalNode calls it a validator only once it is active with its keys on a running node.
        </p>
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
  const live = usePoll<Liveness>('/api/liveness', 30_000);
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
          <p className="flex items-center gap-2 font-mono text-[13px] text-muted">
            {n && <NetworkMark genesis={n.genesis} />}
            {health.state === 'ok' ? `${health.data.mode} · ` : ''}{n ? `#${n.block.height.toLocaleString('en-US')} · runtime ${n.runtime?.split(':')[2] ?? '—'}` : 'reading the chain…'}
          </p>
        </header>
        {view === 'overview' && <Overview health={health} net={net} rewards={rewards} />}
        {view === 'rewards' && <RewardsView rewards={rewards} receipts={receipts} net={net} />}
        {view === 'node' && <NodeView node={node} />}
        {view === 'network' && <NetworkView net={net} live={live} />}
        {view === 'keeper' && <KeeperView health={health} rewards={rewards} unit={chainOf(n?.genesis).unit} />}
        {view === 'setup' && <SetupView health={health} />}
      </main>
    </div>
  );
}

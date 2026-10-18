import { Keyring } from '@polkadot/keyring';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { api, capabilities, finalized } from './chain.js';
import { snapshot } from './collector.js';
import { config, loadKeeper, MAINNET } from './config.js';
import { alert, db, onAlert, resolveAlert } from './db.js';
import { getKeeperStatus } from './keeper.js';
import { liveness } from './liveness.js';
import { latestSample } from './node-health.js';
import { decimal, POT } from './rewards.js';

type Result = Record<string, { ok: boolean; error?: string }>;
const COOLDOWN = 30 * 60_000;
const REPEAT = new Set(['keeper-error', 'collector-error']);
const KEEPER_STOPS = new Set(['low-reserve', 'keeper-ambiguity', 'runtime-change']);
const CHAINS: Record<string, string> = {
  [MAINNET]: 'Portaldot mainnet',
  '0xd4f9acbcf7f52388d8b095abe3c198d19fc510e0343e643e87cfbccb155283bd': 'Portaldot V3 testnet',
};
const eras = config.alertExpiryEras;
const MESSAGES: Record<string, [string, string?]> = {
  'low-reserve': [
    'Keeper balance fell below its reserve; the keeper turned itself off.',
    'Keeper balance is back above its reserve.',
  ],
  'low-balance': [
    'Keeper balance is under its reserve plus one max fee. Top it up before the keeper stops.',
    'Keeper balance is back above its reserve plus one max fee.',
  ],
  'keeper-ambiguity': [
    'Keeper paused: a claim has an unclear result and needs manual recovery.',
    'No claim is paused any more.',
  ],
  'runtime-change': [
    'Keeper paused: the runtime changed after payouts were planned.',
    'The payout plan matches the runtime again.',
  ],
  'payout-expiring': [
    `An allowlisted validator has unclaimed payouts that expire within ${eras} eras.`,
    `This validator has no unclaimed payout expiring within ${eras} eras now.`,
  ],
  'runtime-upgrade': ['The runtime code on chain changed. Check the node binary and the keeper.'],
  'payout-settled': ['The keeper claimed a payout.'],
  'keeper-error': ['A keeper pass failed.'],
  'collector-error': ['Reading the chain failed.'],
  'genesis-mismatch': ['The connected chain does not match PORTALNODE_GENESIS.'],
};
export const summary = (kind: string) => MESSAGES[kind]?.[0] ?? kind;
const secrets = [
  config.telegram?.token,
  config.discordWebhook,
  config.discordWebhook?.split('?')[0].split('/').pop(),
].filter(Boolean) as string[];
const clean = (s: string | null) =>
  secrets
    .reduce((t, x) => t.split(x).join('[redacted]'), s ?? '')
    .replace(/\b(?:https?|wss?):\/\/\S+/gi, '[link]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
const chain = () =>
  CHAINS[(snapshot?.network.genesis ?? config.genesis ?? '').toLowerCase()] ?? 'Portaldot dev chain';
const text = (label: string, line: string, evidence?: string) =>
  [`PortalNode · ${chain()} · ${label}`, line, evidence].filter(Boolean).join('\n');

export const channels = () => ({ telegram: Boolean(config.telegram), discord: Boolean(config.discordWebhook) });

export async function send(message: string): Promise<Result> {
  const targets: [string, string, object][] = [];
  if (config.telegram)
    targets.push([
      'telegram',
      `https://api.telegram.org/bot${config.telegram.token}/sendMessage`,
      { chat_id: config.telegram.chatId, text: message, link_preview_options: { is_disabled: true } },
    ]);
  if (config.discordWebhook)
    targets.push(['discord', config.discordWebhook, { content: message, allowed_mentions: { parse: [] } }]);
  const out: Result = {};
  await Promise.all(
    targets.map(async ([name, url, body]) => {
      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(5000),
        });
        const data: any = await r.json().catch(() => ({}));
        out[name] =
          r.ok && data.ok !== false
            ? { ok: true }
            : { ok: false, error: clean(`HTTP ${r.status} ${data.description ?? data.message ?? ''}`) };
      } catch (e: any) {
        // Never e.message: a fetch TypeError can quote the URL, which holds the secret.
        out[name] = {
          ok: false,
          error: e?.name === 'TimeoutError' ? 'timed out after 5 s' : `network error ${e?.cause?.code ?? ''}`.trim(),
        };
      }
    }),
  );
  return out;
}
export const sendTest = () => send(text('TEST', 'Test alert. PortalNode alerts reach this channel.'));

let queue: Promise<unknown> = Promise.resolve();
export const flush = () => queue;
onAlert((key) => void (queue = queue.then(() => deliver(key)).catch(() => {})));

async function deliver(key: string) {
  if (!config.telegram && !config.discordWebhook) return;
  const row: any = db.prepare('SELECT * FROM alerts WHERE dedupe_key=?').get(key);
  if (!row) return;
  const was = row.delivery_state ? JSON.parse(row.delivery_state) : null;
  const cool = !was || Date.now() - Date.parse(was.at) >= COOLDOWN;
  const raise =
    !row.resolved &&
    cool &&
    (was?.last !== 'raised' || (REPEAT.has(row.kind) && was.evidence !== row.evidence));
  const recover = row.resolved && was?.last === 'raised';
  if (!raise && !recover) return;
  const [down, up = 'Recovered.'] = MESSAGES[row.kind] ?? [row.kind];
  const off = KEEPER_STOPS.has(row.kind) && config.mode === 'operator' && !getKeeperStatus().enabled;
  const message = raise
    ? text(row.severity.toUpperCase(), down, clean(row.evidence))
    : text(
        'RECOVERED',
        `${up}${off ? ' The keeper is still off: turn it on in the console.' : ''}`,
        `last evidence: ${clean(row.evidence)}`,
      );
  const at = new Date().toISOString(),
    result = await send(message);
  const last = recover ? 'recovered' : Object.values(result).some((r) => r.ok) ? 'raised' : 'failed';
  db.prepare('UPDATE alerts SET delivery_state=? WHERE dedupe_key=?').run(
    JSON.stringify({ last, at, evidence: row.evidence, result }),
    key,
  );
}

export function recentAlerts() {
  return (db.prepare('SELECT * FROM alerts ORDER BY last_seen DESC LIMIT 50').all() as any[]).map((a) => {
    const { last, at, result } = a.delivery_state ? JSON.parse(a.delivery_state) : ({} as any);
    return {
      key: a.dedupe_key,
      kind: a.kind,
      severity: a.severity,
      message: summary(a.kind),
      evidence: clean(a.evidence),
      firstSeen: a.first_seen,
      lastSeen: a.last_seen,
      resolved: Boolean(a.resolved),
      delivery: last ? { last, at, result } : null,
    };
  });
}

const units = (s: string) => {
  const [a, b = ''] = s.split('.');
  return BigInt(a) * POT + BigInt((b + '00000000000000').slice(0, 14));
};
const startedAt = new Date().toISOString();
let seenCode: string | undefined, keeperAddress: string | undefined, upstreamCheckedAt = 0;

async function checkUpstream() {
  if (!config.upstreamCheck || Date.now() - upstreamCheckedAt < 6 * 3600_000) return;
  upstreamCheckedAt = Date.now();
  const r = await fetch('https://api.github.com/repos/portaldotVolunteer/Portaldot-node/commits?per_page=1', {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'portalnode' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) return;
  const [head] = (await r.json()) as any[];
  if (head?.sha && head.sha !== config.upstreamCommit)
    alert(
      `upstream-node-${head.sha}`,
      'upstream-node',
      'info',
      `Portaldot-node has commit ${head.sha.slice(0, 10)} (${head.commit?.committer?.date ?? 'unknown date'}): "${String(head.commit?.message ?? '').split('\n')[0].slice(0, 80)}"; this install pins ${config.upstreamCommit.slice(0, 10)}`,
    );
}

export async function watch() {
  const net = snapshot?.network;
  if (!net) return;
  try {
    const code = capabilities?.runtime.codeHash;
    if (code && seenCode && code !== seenCode)
      alert(
        `runtime-code-${code}`,
        'runtime-upgrade',
        'warning',
        `${capabilities!.runtime.name} ${capabilities!.runtime.version} code ${seenCode.slice(0, 10)}… -> ${code.slice(0, 10)}…`,
      );
    seenCode = code ?? seenCode;
    if (net.runtime === capabilities?.fingerprint) resolveAlert('runtime-refresh-mismatch');
    if (!db.prepare("SELECT 1 FROM tx_attempts WHERE status='paused' LIMIT 1").get())
      for (const r of db
        .prepare("SELECT dedupe_key FROM alerts WHERE kind='keeper-ambiguity' AND resolved=0")
        .all() as any[])
        resolveAlert(r.dedupe_key);
    // Era e stays claimable while e >= currentEra - historyDepth.
    if (net.era?.current != null)
      for (const v of config.allowlist) {
        const open = (
          db
            .prepare(
              `SELECT DISTINCT era FROM payouts WHERE genesis=? AND validator=? AND status IN ('claimable','expiring','planned')
              AND era>=? AND era<? ORDER BY era`,
            )
            .all(
              net.genesis,
              v,
              net.era.claimableFrom,
              net.era.current - net.era.historyDepth + config.alertExpiryEras,
            ) as any[]
        ).map((r) => r.era);
        if (open.length)
          alert(`payout-expiring-${v}`, 'payout-expiring', 'warning', `validator=${v} eras=${open.join(',')}`);
        else resolveAlert(`payout-expiring-${v}`);
      }
    if (config.alertPayouts)
      for (const a of db
        .prepare(
          `SELECT t.id,t.validator,t.era,t.page,t.tx_hash,p.paid FROM tx_attempts t
          LEFT JOIN payouts p USING(genesis,validator,era,page)
          WHERE t.status='settled' AND t.error IS NULL AND p.status='claimed' AND t.charged_at>=?
          AND NOT EXISTS (SELECT 1 FROM alerts WHERE dedupe_key='payout-settled-'||t.id)`,
        )
        .all(startedAt) as any[])
        alert(
          `payout-settled-${a.id}`,
          'payout-settled',
          'info',
          `validator=${a.validator} era=${a.era}${a.page >= 0 ? ` page=${a.page}` : ''} paid=${a.paid ? decimal(BigInt(a.paid)) : 'unknown'} tx=${a.tx_hash}`,
        );
    await checkReserve();
    await checkUpstream().catch(() => {});
    const { at, hash } = await finalized();
    const live = await liveness(at, hash.toHex());
    for (const v of live.validators.filter((x) => config.allowlist.includes(x.stash)))
      if (v.atRisk)
        alert(
          `offline-risk-${v.stash}`,
          'offline-risk',
          'critical',
          `validator=${v.stash} session=${live.session} no block or heartbeat yet; ${live.blocksLeftInSession ?? '?'} blocks left before it is reported offline`,
        );
      else if (v.isOnline) resolveAlert(`offline-risk-${v.stash}`);
    for (const k of latestSample().keysLoaded)
      if (k.loaded === false)
        alert(`keys-not-loaded-${k.stash}`, 'keys-not-loaded', 'critical', `validator=${k.stash} next session keys are not in this node's keystore`);
      else if (k.loaded) resolveAlert(`keys-not-loaded-${k.stash}`);
  } catch {}
}

async function checkReserve() {
  const { policy } = getKeeperStatus();
  if (config.mode !== 'operator' || !policy || !api?.isConnected) return;
  if (!keeperAddress) {
    const key = loadKeeper();
    if (!key) return;
    await cryptoWaitReady();
    keeperAddress = new Keyring({ type: 'sr25519' }).addFromUri(key.suri).address;
  }
  const { data }: any = await api.query.system.account(keeperAddress);
  const free = BigInt(data.free.toString()),
    lock = [data.frozen, data.miscFrozen, data.feeFrozen]
      .map((x) => BigInt(x?.toString() ?? 0))
      .reduce((m, x) => (x > m ? x : m), 0n);
  const spendable = free > lock ? free - lock : 0n,
    need = units(policy.minReserve) + units(policy.maxFeePerTx);
  if (spendable < need)
    alert(
      'keeper-balance-low',
      'low-balance',
      'warning',
      `transferable=${decimal(spendable)} needs=${decimal(need)} (reserve ${policy.minReserve} + max fee ${policy.maxFeePerTx})`,
    );
  else {
    resolveAlert('keeper-balance-low');
    resolveAlert('keeper-reserve-low');
  }
}

import { useEffect, useState } from 'react';

export type Validator = {
  stash: string; short: string; commissionPct: number; ownPOT: string; totalPOT: string;
  stakeSharePct: number; nominators: number; hasIdentity: boolean; lastClaimMarker: number | null;
};
const CHAINS: Record<string, { name: string; unit: string; logo: string }> = {
  '0x83b5212c69f85f3996f8696bb35bf913af51b176a5f53d0a74fd3a83dc0b8a54': { name: 'Portaldot mainnet', unit: 'POT', logo: '/brand/portaldot.png' },
  '0xd4f9acbcf7f52388d8b095abe3c198d19fc510e0343e643e87cfbccb155283bd': { name: 'Portaldot V3 testnet', unit: 'tPOT', logo: '/brand/portaldot-v3-testnet.png' },
};
export const chainOf = (genesis?: string) =>
  CHAINS[genesis?.toLowerCase() ?? ''] ?? { name: 'Portaldot dev chain', unit: 'POT', logo: '/brand/portaldot.png' };

export type Network = {
  block: { height: number; hash: string; timestampMs: number };
  computedAt: number;
  validators: { active: number; target: number; waiting: number; list: Validator[] };
  concentration: { top1Pct: number | null; top3Pct: number | null; top5Pct: number | null };
  finality: { authorities: number; threshold: number; canFailBeforeHalt: number; equalWeights: boolean };
  rewards: {
    unclaimedGrossPOT: string; expiring7dPOT: string; estimate: boolean; formula: string;
    expiringEras: { era: number; projectedExpiryUtc: string; grossPOT: string }[];
  };
  idleNominations: { accounts: number; bondedPOT: string; target?: string };
  era?: { current: number; active: number; historyDepth: number; claimableFrom: number };
  runtime?: string;
  genesis?: string;
};
export type Nominator = {
  address: string; bondedPOT: string; allTargetsInactive: boolean;
  targets: { stash: string; active: boolean; commissionPct: number }[];
  expiring: { era: number; validator: string; estimatedNominatorPOT: string; projectedExpiryUtc: string }[];
};

export type Load<T> = { state: 'loading' } | { state: 'ok'; data: T } | { state: 'error'; reason: string };

export async function getJson<T>(path: string): Promise<T> {
  const r = await fetch(path);
  const body = await r.json().catch(() => ({}));
  if (!r.ok || body?.status === 'unavailable') throw new Error(body?.reason ?? `HTTP ${r.status}`);
  return body as T;
}

function normalize(n: Network): Network {
  const c = n.computedAt as unknown as string | number;
  return {
    ...n,
    computedAt: typeof c === 'string' ? Date.parse(c) : c,
    block: { ...n.block, height: Number(n.block.height), timestampMs: Number(n.block.timestampMs) },
  };
}

export function useNetwork(): Load<Network> {
  const [s, set] = useState<Load<Network>>({ state: 'loading' });
  useEffect(() => {
    let live = true;
    const pull = () => getJson<Network>('/api/network')
      .then(normalize)
      .then((data) => live && set({ state: 'ok', data }))
      .catch((e) => live && set((prev) => (prev.state === 'ok' ? prev : { state: 'error', reason: String(e.message ?? e) })));
    pull();
    const id = setInterval(pull, 60_000);
    return () => { live = false; clearInterval(id); };
  }, []);
  return s;
}

export const fmtPOT = (s: string, dp = 0) => {
  const n = Number(s);
  return Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: dp, minimumFractionDigits: dp }) : s;
};

export const ago = (ms: number) => {
  const m = Math.round((Date.now() - ms) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};

export type NodeSample = {
  reachable: number | boolean | null; syncing: number | boolean | null; peers: number | null;
  best_height: number | null; finalized_height: number | null; finality_age: number | null;
  heartbeat_seen: number | boolean | null; authored_count: number | null; sampled_at?: string;
};
export type Health = { rpc: string; mode: 'observer' | 'operator'; lastSnapshotAt: string | null; reason: string | null; node: NodeSample };
export type PayoutRow = { genesis: string; validator: string; era: number; page: number; status: string; estimate: string | null; paid: string | null; reason: string | null; updated_at: string };
export type Attempt = {
  id: number; validator: string; era: number; page: number; tx_hash: string | null; status: string;
  finalized_block: string | null; extrinsic_index: number | null; fee_actual: string | null; error: string | null; reserved_at: string;
};
export type KeeperStatus = { enabled: boolean; policy: { maxFeePerTx: string; budget24h: string; minReserve: string } | null; inFlight: boolean; allowlist: string[] };
export type Rewards = { validators: { validator: string; eras: PayoutRow[]; keeper: KeeperStatus; recentAttempts: Attempt[] }[] };
export type Receipt = { genesis: string; blockHash: string; extrinsicIndex: number; txHash: string; verified: boolean; rewardEvents?: number; reason?: string };

export type Polled<T> = Load<T> & { reload: () => void };

export function usePoll<T>(path: string, every = 30_000, map: (x: T) => T = (x) => x): Polled<T> {
  const [s, set] = useState<Load<T>>({ state: 'loading' });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    const pull = () => getJson<T>(path).then(map)
      .then((data) => live && set({ state: 'ok', data }))
      .catch((e) => live && set((prev) => (prev.state === 'ok' ? prev : { state: 'error', reason: String(e.message ?? e) })));
    pull();
    const id = setInterval(pull, every);
    return () => { live = false; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, every, tick]);
  return { ...s, reload: () => setTick((t) => t + 1) } as Polled<T>;
}

export { normalize as normalizeNetwork };

const TOKEN_KEY = 'portalnode.token';
export const token = {
  get: () => { try { return sessionStorage.getItem(TOKEN_KEY) ?? ''; } catch { return ''; } },
  set: (t: string) => { try { if (t) sessionStorage.setItem(TOKEN_KEY, t); else sessionStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ } },
};

export async function keeperCall(path: string, method: 'POST' | 'PUT', body?: unknown) {
  const r = await fetch(path, {
    method,
    headers: { Authorization: `Bearer ${token.get()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 404) throw new Error('This instance is read-only: keeper controls only exist on an operator box.');
  if (r.status === 401 || r.status === 403) throw new Error(data?.reason ?? 'The console token was rejected.');
  if (!r.ok) throw new Error(data?.reason ?? data?.error ?? `HTTP ${r.status}`);
  return data;
}

export const short = (s: string, n = 6) => (s.length > 2 * n + 1 ? `${s.slice(0, n)}…${s.slice(-n)}` : s);

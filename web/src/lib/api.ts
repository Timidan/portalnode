import { useEffect, useState } from 'react';

export type Validator = {
  stash: string; short: string; commissionPct: number; ownPOT: string; totalPOT: string;
  stakeSharePct: number; nominators: number; hasIdentity: boolean; lastClaimMarker: number | null;
};
export type Network = {
  block: { height: number; hash: string; timestampMs: number };
  computedAt: number;
  validators: { active: number; target: number; waiting: number; list: Validator[] };
  concentration: { top1Pct: number; top3Pct: number; top5Pct: number };
  finality: { authorities: number; threshold: number; canFailBeforeHalt: number; equalWeights: boolean };
  rewards: {
    unclaimedGrossPOT: string; expiring7dPOT: string; estimate: boolean; formula: string;
    expiringEras: { era: number; projectedExpiryUtc: string; grossPOT: string }[];
  };
  idleNominations: { accounts: number; bondedPOT: string; target?: string };
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

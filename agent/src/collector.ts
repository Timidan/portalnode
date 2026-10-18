import { finalized } from './chain.js';
import { config } from './config.js';
import { db } from './db.js';
import { decimal, percent, POT, grossReward, mul, perbill, nominatorReward } from './rewards.js';
const WEEK = 7n * 24n * 60n * 60n * 1000n;

const entries = (x: any) => [...x] as [any, any][];
const addr = (x: any) => x.toString();
const num = (x: any) => Number(x.toString());
const bi = (x: any) => BigInt(x.toString());
const sum = (x: bigint[]) => x.reduce((a, b) => a + b, 0n);
const clipped = (v: any) => ({
  total: bi(v.total),
  own: bi(v.own),
  others: [...v.others].map((n: any) => ({ who: addr(n.who), value: bi(n.value) })),
});

export type Snapshot = {
  network: any;
  accounts: Map<string, any>;
  validators: Set<string>;
  commissions: Map<string, bigint>;
  rewards: Map<string, any[]>;
  capabilities: any;
};
export let snapshot: Snapshot | null = null;
export let snapshotError: string | null = 'Initial snapshot is being computed';
let running = false;

export async function collect() {
  if (running) return;
  running = true;
  try {
    const { client, at, hash, shape } = await finalized();
    const q: any = at.query,
      hasStaking = shape.staking;
    const [
      header,
      timestamp,
      activeEraOpt,
      currentEraOpt,
      historyOpt,
      sessionOpt,
      targetOpt,
      validatorsRaw,
      identityRaw,
      forceEra,
      genesisSlot,
      sessionsPerEra,
      minPeriod,
      epochDuration,
    ] = await Promise.all([
      client.rpc.chain.getHeader(hash),
      q.timestamp.now(),
      hasStaking ? q.staking.activeEra() : null,
      hasStaking ? q.staking.currentEra() : null,
      hasStaking ? (q.staking.historyDepth?.() ?? (at.consts.staking as any).historyDepth) : null,
      (at.query.session as any)?.validators?.() ?? null,
      hasStaking ? q.staking.validatorCount() : null,
      hasStaking ? q.staking.validators.entries() : [],
      (at.query.identity as any)?.identityOf?.entries?.() ?? [],
      hasStaking ? q.staking.forceEra() : null,
      (at.query.babe as any)?.genesisSlot?.() ?? null,
      (at.consts.staking as any)?.sessionsPerEra ?? null,
      (at.consts.timestamp as any)?.minimumPeriod ?? null,
      (at.consts.babe as any)?.epochDuration ?? null,
    ]);
    const era = activeEraOpt?.isSome ? num(activeEraOpt.unwrap().index) : null;
    const currentEra = currentEraOpt?.isSome ? num(currentEraOpt.unwrap()) : era;
    const eraStart =
      hasStaking && currentEra !== null ? await q.staking.erasStartSessionIndex(currentEra) : null;
    const active = new Set<string>([...(sessionOpt ?? [])].map(addr));
    const candidates = entries(validatorsRaw).map(([k]) => addr(k.args[0]));
    const identities = new Set(
      entries(identityRaw)
        .filter(([, v]) => v.isSome)
        .map(([k]) => addr(k.args[0])),
    );
    let expEntries: [any, any][] = [],
      points: [any, any][] = [],
      payouts: [any, any][] = [],
      stakes: [any, any][] = [],
      prefs: [any, any][] = [];
    if (hasStaking)
      [expEntries, points, payouts, stakes, prefs] = await Promise.all([
        q.staking.erasStakersClipped.entries(),
        q.staking.erasRewardPoints.entries(),
        q.staking.erasValidatorReward.entries(),
        q.staking.erasTotalStake.entries(),
        q.staking.erasValidatorPrefs.entries(),
      ]);
    const payoutByEra = new Map(
      entries(payouts)
        .filter(([, v]) => v.isSome)
        .map(([k, v]) => [num(k.args[0]), bi(v.unwrap())]),
    );
    const stakeByEra = new Map(entries(stakes).map(([k, v]) => [num(k.args[0]), bi(v)]));
    const pointsByEra = new Map(entries(points).map(([k, v]) => [num(k.args[0]), v]));
    const prefByEra = new Map(
      entries(prefs).map(([k, v]) => [`${num(k.args[0])}:${addr(k.args[1])}`, bi(v.commission)]),
    );
    const ledgerEntries = hasStaking ? entries(await q.staking.ledger.entries()) : [];
    const ledgerByStash = new Map<string, any>();
    for (const [key, opt] of ledgerEntries)
      if (opt.isSome) {
        const v = opt.unwrap();
        ledgerByStash.set(addr(v.stash), {
          claimed: new Set([...(v.claimedRewards ?? v.legacyClaimedRewards ?? [])].map(num)),
          active: bi(v.active),
        });
      }
    const eraMin = Math.max(0, (currentEra ?? 0) - num(historyOpt ?? 0));
    const rewardRows = new Map<string, any[]>();
    const formulaVerified = shape.runtime.name === 'portaldot' && shape.runtime.version === 1002;
    const paged = shape.payoutMode === 'explicit-page';
    const formula = formulaVerified
      ? 'portaldot-fork stake-weighted'
      : paged
        ? 'points share of the era payout'
        : null;
    let unclaimed = 0n;
    const eras = new Map<string, any>();
    let expiry: (era: number) => bigint | null = () => null;
    if (
      forceEra?.isNotForcing &&
      eraStart?.isSome &&
      genesisSlot &&
      sessionsPerEra &&
      minPeriod &&
      epochDuration &&
      currentEra !== null &&
      timestamp !== null
    ) {
      const ts = bi(timestamp),
        sessions = bi(sessionsPerEra),
        sessionMs = bi(epochDuration) * bi(minPeriod) * 2n,
        slotMs = bi(minPeriod) * 2n;
      const next = bi(genesisSlot) * slotMs + (bi(eraStart.unwrap()) + sessions - 1n) * sessionMs;
      if (next > ts)
        expiry = (e: number) => next + BigInt(e + num(historyOpt) - currentEra) * sessions * sessionMs;
    }
    const expiringByEra = new Map<number, bigint>(),
      expiringRows: any[] = [];
    for (const [key, value] of formulaVerified ? entries(expEntries) : []) {
      const e = num(key.args[0]),
        validator = addr(key.args[1]);
      if (e < eraMin || e >= (era ?? Number.MAX_SAFE_INTEGER) || !payoutByEra.has(e)) continue;
      const exp = clipped(value),
        ledger = ledgerByStash.get(validator);
      if (!exp.total || !ledger) continue;
      const rp: any = pointsByEra.get(e);
      if (!rp) continue;
      const point = [...rp.individual].find(([who]: any[]) => addr(who) === validator)?.[1];
      const gross = grossReward(
        bi(point ?? 0),
        bi(rp.total),
        exp.total,
        stakeByEra.get(e) ?? 0n,
        payoutByEra.get(e)!,
        POT,
      );
      if (!gross) continue;
      const claimed = ledger.claimed.has(e),
        expires = expiry(e),
        expiring = !claimed && expires !== null && expires <= BigInt(num(timestamp) + Number(WEEK));
      if (!claimed) {
        unclaimed += gross;
        if (expiring) {
          expiringByEra.set(e, (expiringByEra.get(e) ?? 0n) + gross);
          expiringRows.push({
            era: e,
            projectedExpiryUtc: new Date(Number(expires)).toISOString(),
            grossPOT: decimal(gross),
          });
        }
      }
      const payout = {
        era: e,
        validator,
        page: -1,
        estimatedPOT: decimal(gross),
        status: claimed ? 'claimed' : expiring ? 'expiring' : 'claimable',
        claimed,
      };
      eras.set(`${e}:${validator}`, payout);
      const commission = prefByEra.get(`${e}:${validator}`) ?? 0n;
      if (!claimed && expiring)
        for (const n of exp.others) {
          const amount = nominatorReward(gross, commission, n.value, exp.total);
          const rows = rewardRows.get(n.who) ?? [];
          rows.push({
            era: e,
            validator,
            estimatedNominatorPOT: decimal(amount),
            projectedExpiryUtc: new Date(Number(expires)).toISOString(),
          });
          rewardRows.set(n.who, rows);
        }
    }
    if (paged && era !== null)
      for (let e = eraMin; e < era; e++) {
        const pool = payoutByEra.get(e),
          rp: any = pointsByEra.get(e);
        if (!pool || !rp || !bi(rp.total)) continue;
        const who = [...rp.individual].map(([w, p]: any[]) => [addr(w), bi(p)] as const);
        const [overviews, claims] = await Promise.all([
          Promise.all(who.map(([v]) => q.staking.erasStakersOverview(e, v))),
          Promise.all(who.map(([v]) => q.staking.claimedRewards(e, v))),
        ]);
        who.forEach(([validator, point], i) => {
          if (overviews[i].isNone) return;
          const o = overviews[i].unwrap(),
            pages = num(o.pageCount) || (bi(o.own) > 0n ? 1 : 0),
            claimedPages = new Set([...claims[i]].map(num)),
            gross = (pool * point) / bi(rp.total),
            expires = expiry(e);
          for (let page = 0; page < pages; page++) {
            const claimed = claimedPages.has(page),
              share = gross / BigInt(pages),
              expiring = !claimed && expires !== null && expires <= BigInt(num(timestamp) + Number(WEEK));
            if (!claimed) unclaimed += share;
            if (expiring) {
              expiringByEra.set(e, (expiringByEra.get(e) ?? 0n) + share);
              expiringRows.push({
                era: e,
                projectedExpiryUtc: new Date(Number(expires)).toISOString(),
                grossPOT: decimal(share),
              });
            }
            eras.set(`${e}:${validator}:${page}`, {
              era: e,
              validator,
              page,
              estimatedPOT: decimal(share),
              status: claimed ? 'claimed' : expiring ? 'expiring' : 'claimable',
              claimed,
            });
          }
        });
      }
    const validators = new Set(candidates);
    const currentExposures = new Map<string, ReturnType<typeof clipped>>(
      entries(expEntries)
        .filter(([k]) => num(k.args[0]) === era)
        .map(([k, v]) => [addr(k.args[1]), clipped(v)]),
    );
    if (paged && era !== null) {
      const [overviews, pages] = await Promise.all([
        q.staking.erasStakersOverview.entries(era),
        q.staking.erasStakersPaged.entries(era),
      ]);
      for (const [k, v] of entries(overviews))
        if (v.isSome)
          currentExposures.set(addr(k.args[1]), {
            total: bi(v.unwrap().total),
            own: bi(v.unwrap().own),
            others: [],
          });
      for (const [k, v] of entries(pages))
        if (v.isSome)
          currentExposures
            .get(addr(k.args[1]))
            ?.others.push(
              ...[...v.unwrap().others].map((n: any) => ({ who: addr(n.who), value: bi(n.value) })),
            );
    }
    const totalStake = sum([...currentExposures.values()].map((e) => e.total));
    const candidateByStash = new Map<string, bigint>(
      entries(validatorsRaw).map(([k, v]) => [addr(k.args[0]), bi(v.commission)]),
    );
    const list = [...active].map((stash) => {
      const v = currentExposures.get(stash) ?? { total: 0n, own: 0n, others: [] };
      return {
        stash,
        short: `${stash.slice(0, 6)}…${stash.slice(-6)}`,
        commissionPct: candidateByStash.has(stash)
          ? percent(candidateByStash.get(stash)!, 1_000_000_000n)
          : null,
        ownPOT: decimal(v.own),
        totalPOT: decimal(v.total),
        stakeSharePct: totalStake ? percent(v.total, totalStake) : null,
        nominators: v.others.length,
        hasIdentity: identities.has(stash),
        lastClaimMarker: ledgerByStash.get(stash)?.claimed.size
          ? Math.max(...ledgerByStash.get(stash).claimed)
          : null,
      };
    });
    const nominationEntries: [any, any][] = hasStaking ? entries(await q.staking.nominators.entries()) : [];
    const accounts = new Map<string, any>();
    for (const [key, opt] of nominationEntries)
      if (opt.isSome) {
        const who = addr(key.args[0]),
          ledger = ledgerByStash.get(who);
        accounts.set(who, { bonded: ledger?.active ?? 0n, targets: [...opt.unwrap().targets].map(addr) });
      }
    for (const stash of candidates)
      if (!accounts.has(stash))
        accounts.set(stash, { bonded: ledgerByStash.get(stash)?.active ?? 0n, targets: [], validator: true });
    const exposedNominators = new Set(
      [...currentExposures.values()].flatMap((e) => e.others.map((n) => n.who)),
    );
    let idleCount = 0,
      idleBond = 0n;
    const idleTargets = new Set<string>();
    for (const [who, a] of accounts) {
      if (a.targets.length && a.targets.every((t: string) => !active.has(t)) && !exposedNominators.has(who)) {
        idleCount++;
        idleBond += a.bonded;
        a.targets.forEach((t: string) => idleTargets.add(t));
      }
    }
    const stakeValues = [...currentExposures.values()]
      .map((e) => e.total)
      .sort((a, b) => (a > b ? -1 : a < b ? 1 : 0));
    const share = (n: number) => (totalStake ? percent(sum(stakeValues.slice(0, n)), totalStake) : null);
    let finality: any = { authorities: null, threshold: null, canFailBeforeHalt: null, equalWeights: null },
      weights: bigint[] = [];
    try {
      const stored: any = await client.rpc.state.getStorage(
          '0x3a6772616e6470615f617574686f726974696573',
          hash,
        ),
        raw = stored?.toHex() ?? '';
      const fromPallet = (at.query as any).grandpa?.authorities;
      const pairs: any = fromPallet
        ? await fromPallet()
        : raw.startsWith('0x01')
          ? at.registry.createType('Vec<(AccountId,u64)>', `0x${raw.slice(4)}`)
          : null;
      if (pairs?.length) {
        weights = [...pairs].map((pair) => bi(pair[1]));
        const total = sum(weights),
          threshold = (total * 2n) / 3n + 1n;
        let removed = 0n,
          canFail = 0;
        for (const w of [...weights].sort((a, b) => (a > b ? -1 : a < b ? 1 : 0))) {
          removed += w;
          if (total - removed < threshold) break;
          canFail++;
        }
        finality = {
          authorities: weights.length,
          threshold: threshold <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(threshold) : null,
          canFailBeforeHalt: canFail,
          equalWeights: weights.every((w) => w === weights[0]),
        };
      }
    } catch {}
    let offenceCount: number | null = null;
    try {
      const reports = (at.query as any).offences?.reports;
      if (reports) offenceCount = entries(await reports.entries()).length;
    } catch {}
    const sampleTime = new Date().toISOString();
    const network = {
      block: { height: header.number.toNumber(), hash: hash.toHex(), timestampMs: num(timestamp) },
      computedAt: sampleTime,
      validators: {
        active: active.size,
        target: num(targetOpt ?? 0),
        waiting: Math.max(0, candidates.length - active.size),
        list,
      },
      era: { current: currentEra, active: era, historyDepth: num(historyOpt ?? 0), claimableFrom: eraMin },
      concentration: { top1Pct: share(1), top3Pct: share(3), top5Pct: share(5) },
      finality,
      rewards: {
        unclaimedGrossPOT: formula ? decimal(unclaimed) : null,
        expiring7dPOT: formula ? decimal(sum([...expiringByEra.values()])) : null,
        estimate: Boolean(formula),
        formula,
        expiringEras: [...expiringByEra]
          .sort(([a], [b]) => a - b)
          .map(([era, grossPOT]) => ({
            era,
            projectedExpiryUtc: expiringRows.find((r) => r.era === era)?.projectedExpiryUtc,
            grossPOT: decimal(grossPOT),
          })),
      },
      idleNominations: {
        accounts: idleCount,
        bondedPOT: decimal(idleBond),
        target: idleTargets.size === 1 ? [...idleTargets][0] : undefined,
      },
      genesis: client.genesisHash.toHex(),
      runtime: shape.fingerprint,
    };
    const gaps = shape.gaps;
    db.prepare(
      `INSERT OR REPLACE INTO network_snapshots(finalized_hash,era,validator_count,target_count,stake_concentration,authority_weights,identity_count,offence_count,capability_gaps,computed_at) VALUES(?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      hash.toHex(),
      era,
      active.size,
      network.validators.target,
      JSON.stringify(network.concentration),
      JSON.stringify(weights.map(String)),
      identities.size,
      offenceCount,
      JSON.stringify(gaps),
      sampleTime,
    );
    // Oldest payout first; only the five architecture tables are persisted.
    for (const p of eras.values())
      db.prepare(
        `INSERT INTO payouts(genesis,validator,era,page,status,estimate,reason) VALUES(?,?,?,?,?,?,?)
      ON CONFLICT(genesis,validator,era,page) DO UPDATE SET status=CASE WHEN payouts.status='terminal' THEN 'terminal' ELSE excluded.status END,estimate=excluded.estimate,updated_at=CURRENT_TIMESTAMP`,
      ).run(network.genesis, p.validator, p.era, p.page, p.status, p.estimatedPOT, null);
    snapshot = {
      network,
      accounts,
      validators,
      commissions: candidateByStash,
      rewards: new Map([...rewardRows]),
      capabilities: shape,
    };
    snapshotError = null;
  } catch (e) {
    snapshotError = (e instanceof Error ? e.message : String(e)).replace(/[\r\n]+/g, ' ').slice(0, 240);
  } finally {
    running = false;
  }
}

export function getRewardRows(address: string) {
  return snapshot?.rewards.get(address) ?? [];
}
export function plan(allowlist = config.allowlist) {
  const rows = db
    .prepare(
      `SELECT * FROM payouts WHERE validator IN (${allowlist.map(() => ' ?').join(',') || "''"}) AND status IN ('claimable','expiring','planned') ORDER BY era,validator,page`,
    )
    .all(...allowlist) as any[];
  return rows;
}

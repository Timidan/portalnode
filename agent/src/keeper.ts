import { ApiPromise } from '@polkadot/api';
import { Keyring } from '@polkadot/keyring';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { config, loadKeeper, MAINNET } from './config.js';
import { alert, db } from './db.js';
import { finalized } from './chain.js';
import { collect, plan, snapshot as currentSnapshot } from './collector.js';

export type Policy = { maxFeePerTx: string; budget24h: string; minReserve: string };
let policy: Policy | null = null;
let enabled = false;
export const setPolicy = (p: Policy) => {
  for (const v of [p.maxFeePerTx, p.budget24h, p.minReserve])
    if (!/^\d+(\.\d{1,14})?$/.test(v))
      throw new Error('Fee values must be decimal POT amounts with at most 14 places');
  policy = p;
};
if (
  process.env.PORTALNODE_MAX_FEE &&
  process.env.PORTALNODE_BUDGET_24H &&
  process.env.PORTALNODE_MIN_RESERVE
) {
  setPolicy({
    maxFeePerTx: process.env.PORTALNODE_MAX_FEE,
    budget24h: process.env.PORTALNODE_BUDGET_24H,
    minReserve: process.env.PORTALNODE_MIN_RESERVE,
  });
}
export const getKeeperStatus = () => ({
  enabled,
  policy,
  inFlight: Boolean(
    db.prepare("SELECT 1 FROM tx_attempts WHERE status IN ('unresolved','paused') LIMIT 1").get(),
  ),
  allowlist: config.allowlist,
});
export function enable() {
  if (
    config.mode !== 'operator' ||
    !policy ||
    !config.keyFile ||
    !config.allowlist.length ||
    !config.token ||
    config.token.length < 32
  )
    throw new Error('Operator, key, allowlist, 32-character bearer token, and fee policy are required');
  enabled = true;
}
export function disable() {
  enabled = false;
}
const pot = 100_000_000_000_000n;
const units = (s: string) => {
  const [a, b = ''] = s.split('.');
  return BigInt(a) * pot + BigInt((b + '00000000000000').slice(0, 14));
};
const rewardAmount = (ev: any) => BigInt((ev.method === 'Rewarded' ? ev.data[2] : ev.data[1]).toString());

async function reconcile(client: ApiPromise) {
  const pending = db
    .prepare("SELECT * FROM tx_attempts WHERE status IN ('unresolved','paused') ORDER BY id")
    .all() as any[];
  for (const a of pending) {
    const headHash = await client.rpc.chain.getFinalizedHead(),
      head = (await client.rpc.chain.getHeader(headHash)).number.toNumber();
    let found: { hash: string; index: number; number: number } | null = null;
    for (let h = a.birth; h <= Math.min(head, a.death); h++) {
      const bh = await client.rpc.chain.getBlockHash(h),
        block = await client.rpc.chain.getBlock(bh);
      const idx = [...block.block.extrinsics].findIndex((ex) => ex.hash.toHex() === a.tx_hash);
      if (idx >= 0) {
        found = { hash: bh.toHex(), index: idx, number: h };
        break;
      }
    }
    if (found) {
      const records: any[] = [...((await client.query.system.events.at(found.hash)) as any)];
      const rewards = records.filter(
        (r) =>
          r.phase.isApplyExtrinsic &&
          r.phase.asApplyExtrinsic.toNumber() === found!.index &&
          r.event.section === 'staking' &&
          (r.event.method === 'Reward' || r.event.method === 'Rewarded'),
      );
      const failed = records.find(
        (r) =>
          r.phase.isApplyExtrinsic &&
          r.phase.asApplyExtrinsic.toNumber() === found!.index &&
          r.event.method === 'ExtrinsicFailed',
      );
      const paid = rewards.reduce((n, r) => n + rewardAmount(r.event), 0n).toString();
      const feeEvent = records.find(
        (r) =>
          r.phase.isApplyExtrinsic &&
          r.phase.asApplyExtrinsic.toNumber() === found!.index &&
          r.event.section === 'transactionPayment' &&
          r.event.method === 'TransactionFeePaid',
      );
      const actualFee = feeEvent ? ((feeEvent.event.data as any)[1]?.toString() ?? null) : null;
      db.prepare(
        "UPDATE tx_attempts SET status='settled',finalized_block=?,finalized_number=?,extrinsic_index=?,events=?,fee_actual=?,charged_at=? WHERE id=?",
      ).run(
        found.hash,
        found.number,
        found.index,
        JSON.stringify(rewards.map((r) => r.event.data.toString())),
        actualFee,
        new Date().toISOString(),
        a.id,
      );
      db.prepare(
        'UPDATE payouts SET status=?,paid=?,reason=?,updated_at=CURRENT_TIMESTAMP WHERE genesis=? AND validator=? AND era=? AND page=?',
      ).run(
        failed ? 'terminal' : 'claimed',
        paid,
        failed ? 'finalized extrinsic failed' : null,
        a.genesis,
        a.validator,
        a.era,
        a.page,
      );
    } else {
      const current = await finalized();
      if (current.shape.fingerprint !== a.runtime_fingerprint) {
        disable();
        db.prepare(
          "UPDATE tx_attempts SET status='paused',error='runtime changed while attempt pending' WHERE id=?",
        ).run(a.id);
        alert(
          `runtime-change-attempt-${a.id}`,
          'keeper-ambiguity',
          'critical',
          `attempt=${a.id} tx=${a.tx_hash}`,
        );
        continue;
      }
      const account: any = await (await client.at(headHash)).query.system.account(a.signer),
        nonce = BigInt(account.nonce.toString());
      if (nonce === BigInt(a.nonce) && head <= a.death) continue;
      if (nonce === BigInt(a.nonce))
        db.prepare(
          "UPDATE tx_attempts SET status='dropped',error='mortality expired; nonce unchanged' WHERE id=?",
        ).run(a.id);
      else {
        db.prepare(
          "UPDATE tx_attempts SET status='paused',error='ambiguous after restart; manual recovery required' WHERE id=?",
        ).run(a.id);
        alert(`ambiguous-attempt-${a.id}`, 'keeper-ambiguity', 'critical', `attempt=${a.id} tx=${a.tx_hash}`);
      }
    }
  }
}

export async function runOnce(force = false) {
  if (!config.genesis) throw new Error('PORTALNODE_GENESIS is required for keeper operations');
  const client = await (async () => (await finalized()).client)();
  if (
    client.genesisHash.toHex().toLowerCase() !== config.genesis ||
    client.genesisHash.toHex().toLowerCase() === MAINNET
  )
    throw new Error('Keeper refuses mismatched genesis and mainnet');
  await reconcile(client);
  await collect();
  if (!enabled && !force)
    return {
      action: 'dry-run',
      planned: plan().map((p) => `${p.validator}:${p.era}`),
      reason: 'keeper disabled or fee policy not set',
    };
  if (!policy)
    return {
      action: 'dry-run',
      planned: plan().map((p) => `${p.validator}:${p.era}`),
      reason: 'fee policy not set',
    };
  if (!config.allowlist.length) return { action: 'dry-run', planned: [], reason: 'allowlist empty' };
  if (db.prepare("SELECT 1 FROM tx_attempts WHERE status IN ('unresolved','paused') LIMIT 1").get())
    return { action: 'paused', reason: 'existing attempt unresolved' };
  const plans = plan();
  if (!plans.length)
    return force
      ? { action: 'dry-run', planned: [], submitted: 0, reason: 'no funded exposure reward is claimable yet' }
      : { action: 'noop', submitted: 0, reason: 'no claimable allowlisted rewards' };
  const parsed = loadKeeper();
  if (!parsed) return { action: 'dry-run', planned: plans.length, reason: 'keeper key missing' };
  if (!(await cryptoWaitReady())) throw new Error('Polkadot cryptography initialization failed');
  const pair = new Keyring({ type: 'sr25519' }).addFromUri(parsed.suri);
  for (const p of plans) {
    const { client: c, at, hash, shape } = await finalized();
    if (currentSnapshot?.network.runtime !== shape.fingerprint) {
      disable();
      alert('runtime-refresh-mismatch', 'runtime-change', 'critical', shape.fingerprint);
      throw new Error('Runtime changed since payout planning; keeper paused');
    }
    const byPage = shape.payoutMode === 'explicit-page',
      pageRow = p.page >= 0;
    if (shape.payoutMode === 'none' || shape.payoutMode === 'next-page' || byPage !== pageRow) {
      db.prepare(
        "UPDATE payouts SET status='terminal',reason=? WHERE genesis=? AND validator=? AND era=? AND page=?",
      ).run(
        `unsupported payout shape: ${shape.payoutMode}`,
        c.genesisHash.toHex(),
        p.validator,
        p.era,
        p.page,
      );
      continue;
    }
    const q: any = at.query;
    const min: any = q.staking.historyDepth?.() ?? (at.consts.staking as any).historyDepth,
      active: any = await q.staking.activeEra();
    const [depth, activeEra] = await Promise.all([min, active]);
    const current = (await q.staking.currentEra()).unwrap().toNumber(),
      eActive = activeEra.unwrap().index.toNumber(),
      eMin = Math.max(0, current - depth.toNumber());
    if (p.era < eMin || p.era >= eActive) continue;
    const ledger: any = byPage ? null : await q.staking.ledger(p.validator),
      ledgerData = ledger?.isSome ? ledger.unwrap() : null;
    const done = byPage
      ? [...(await q.staking.claimedRewards(p.era, p.validator))].some((x: any) => x.toNumber() === p.page)
      : !ledgerData || [...(ledgerData.claimedRewards as any)].some((x: any) => x.toNumber() === p.era);
    if (done) {
      db.prepare(
        "UPDATE payouts SET status='terminal',reason='already claimed or missing ledger' WHERE genesis=? AND validator=? AND era=? AND page=?",
      ).run(c.genesisHash.toHex(), p.validator, p.era, p.page);
      continue;
    }
    if (!config.allowlist.includes(p.validator)) continue;
    const tx = byPage
      ? c.tx.staking.payoutStakersByPage(p.validator, p.era, p.page)
      : c.tx.staking.payoutStakers(p.validator, p.era);
    const nonce = await c.rpc.system.accountNextIndex(pair.address);
    const blockHash = hash,
      header = await c.rpc.chain.getHeader(hash),
      mortal = c.createType('ExtrinsicEra', { current: header.number.toNumber(), period: 64 });
    const death = header.number.toNumber() + 64;
    const info = await tx.paymentInfo(pair.address, { nonce });
    const fee = BigInt(info.partialFee.toString()),
      maxFee = units(policy.maxFeePerTx),
      budget = units(policy.budget24h),
      reserve = units(policy.minReserve);
    const constants: any = at.consts.system;
    const maxTotal = constants.blockWeights.perClass.normal.maxTotal.unwrap();
    const maxWeight = BigInt((maxTotal.refTime ?? maxTotal).toString());
    const weight = BigInt(((info.weight as any).refTime ?? info.weight).toString());
    const maxLength = BigInt(constants.blockLength.max.normal.toString()),
      length = BigInt(tx.toU8a().length);
    if (weight > maxWeight || length > maxLength) {
      db.prepare(
        "UPDATE payouts SET status='terminal',reason=? WHERE genesis=? AND validator=? AND era=? AND page=?",
      ).run(
        `oversize: weight=${weight}/${maxWeight} bytes=${length}/${maxLength}`,
        c.genesisHash.toHex(),
        p.validator,
        p.era,
        p.page,
      );
      continue;
    }
    const spent = (
      db
        .prepare(
          "SELECT fee_reserved FROM tx_attempts WHERE julianday(reserved_at)>=julianday('now','-24 hours')",
        )
        .all() as any[]
    ).reduce((n, r) => n + BigInt(r.fee_reserved), 0n);
    if (fee > maxFee || spent + fee > budget) throw new Error('Fee policy limit exceeded');
    const acct: any = await q.system.account(pair.address),
      free = BigInt(acct.data.free.toString());
    const ed = BigInt(at.consts.balances.existentialDeposit.toString());
    const frozen = BigInt((acct.data.miscFrozen ?? 0).toString()),
      feeFrozen = BigInt((acct.data.feeFrozen ?? 0).toString());
    const transferable = free - (frozen > feeFrozen ? frozen : feeFrozen);
    if (reserve < ed || transferable - fee < reserve) {
      disable();
      alert(
        'keeper-reserve-low',
        'low-reserve',
        'critical',
        'Keeper transferable balance is below configured reserve',
      );
      throw new Error('Keeper balance is below fee policy reserve');
    }
    const callHex = tx.method.toHex();
    tx.sign(pair, {
      nonce,
      era: mortal,
      blockHash,
      genesisHash: c.genesisHash,
      runtimeVersion: c.runtimeVersion,
      tip: 0,
    });
    const txHash = tx.hash.toHex();
    const inserted = db
      .prepare(
        `INSERT INTO tx_attempts(genesis,validator,era,page,signer,nonce,runtime_fingerprint,call_hex,tx_hash,birth,death,fee_reserved,fee_quoted,reserved_at,status)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'unresolved')`,
      )
      .run(
        c.genesisHash.toHex(),
        p.validator,
        p.era,
        p.page,
        pair.address,
        nonce.toString(),
        shape.fingerprint,
        callHex,
        txHash,
        header.number.toNumber(),
        death,
        fee.toString(),
        fee.toString(),
        new Date().toISOString(),
      );
    if (process.env.PORTALNODE_CRASH_AFTER_PERSIST === '1') process.exit(75);
    const receipt = await new Promise<any>((resolve, reject) => {
      let unsub: (() => void) | undefined;
      void tx
        .send(async (result: any) => {
          if (result.status.isInBlock || result.status.isFinalized) {
            if (result.status.isFinalized) {
              unsub?.();
              resolve(result);
            }
          } else if (result.isError) {
            unsub?.();
            reject(new Error('Broadcast failed'));
          }
        })
        .then((fn: any) => {
          unsub = fn;
        })
        .catch(reject);
    });
    const finalizedHash = receipt.status.asFinalized.toHex(),
      block = await c.rpc.chain.getBlock(finalizedHash);
    const index = [...block.block.extrinsics].findIndex((ex) => ex.hash.toHex() === txHash);
    if (index < 0) {
      disable();
      db.prepare(
        "UPDATE tx_attempts SET status='paused',error='finalized block did not contain submitted transaction' WHERE id=?",
      ).run(inserted.lastInsertRowid);
      alert('missing-finalized-tx', 'keeper-ambiguity', 'critical', `tx=${txHash}`);
      return { action: 'paused', txHash, reason: 'finalized inclusion could not be matched' };
    }
    const events: any[] = [...((await c.query.system.events.at(finalizedHash)) as any)];
    const rewardEvents = events.filter(
      (r) =>
        r.phase.isApplyExtrinsic &&
        r.phase.asApplyExtrinsic.toNumber() === index &&
        r.event.section === 'staking' &&
        (r.event.method === 'Reward' || r.event.method === 'Rewarded'),
    );
    const failed = events.find(
      (r) =>
        r.phase.isApplyExtrinsic &&
        r.phase.asApplyExtrinsic.toNumber() === index &&
        r.event.method === 'ExtrinsicFailed',
    );
    const paid = rewardEvents.reduce((n, r) => n + rewardAmount(r.event), 0n).toString();
    const feeEvent = events.find(
      (r) =>
        r.phase.isApplyExtrinsic &&
        r.phase.asApplyExtrinsic.toNumber() === index &&
        r.event.section === 'transactionPayment' &&
        r.event.method === 'TransactionFeePaid',
    );
    const actualFee = feeEvent ? ((feeEvent.event.data as any)[1]?.toString() ?? null) : null;
    const status = failed ? 'terminal' : rewardEvents.length ? 'claimed' : 'terminal';
    db.prepare(
      "UPDATE tx_attempts SET status='settled',finalized_block=?,finalized_number=?,extrinsic_index=?,events=?,fee_actual=?,charged_at=?,error=? WHERE id=?",
    ).run(
      finalizedHash,
      block.block.header.number.toNumber(),
      index,
      JSON.stringify(rewardEvents.map((r) => r.event.data.toString())),
      actualFee,
      new Date().toISOString(),
      failed ? 'ExtrinsicFailed' : null,
      inserted.lastInsertRowid,
    );
    db.prepare(
      'UPDATE payouts SET status=?,paid=?,reason=?,updated_at=CURRENT_TIMESTAMP WHERE genesis=? AND validator=? AND era=? AND page=?',
    ).run(
      status,
      paid,
      failed ? 'finalized extrinsic failed' : null,
      c.genesisHash.toHex(),
      p.validator,
      p.era,
      p.page,
    );
    return { action: 'submitted', txHash, finalized: finalizedHash, extrinsicIndex: index, paid };
  }
  return { action: 'noop', submitted: 0 };
}

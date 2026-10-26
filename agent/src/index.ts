import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, finalized, api } from './chain.js';
import { collect, snapshot, snapshotError, getRewardRows, paidThrough } from './collector.js';
import { reportHealth } from './health.js';
import { config } from './config.js';
import { db, alert, resolveAlert } from './db.js';
import { disable, enable, getKeeperStatus, runOnce, setPolicy } from './keeper.js';
import { latestSample, sampleNode } from './node-health.js';
import { channels, recentAlerts, sendTest, watch } from './notify.js';
import { liveness } from './liveness.js';
import { decimal, percent } from './rewards.js';
import { build, consoleLink, Invalid, preflight, rotateKeys, status as wizardStatus } from './wizard.js';
import { decodeAddress, encodeAddress } from '@polkadot/util-crypto';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));
app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
const auth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const origin = req.get('origin');
  if (
    !config.allowedHosts.includes(req.hostname.toLowerCase()) ||
    (origin && !config.allowedOrigins.includes(origin))
  ) {
    res.status(403).json({ status: 'forbidden' });
    return;
  }
  const token = config.token,
    sent = req.get('authorization')?.replace(/^Bearer /, '');
  if (!token || !sent) {
    res.status(401).json({ status: 'unauthorized' });
    return;
  }
  const a = Buffer.from(token),
    b = Buffer.from(sent);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    res.status(401).json({ status: 'unauthorized' });
    return;
  }
  next();
};
const snapshotStatus = () =>
  !api?.isConnected
    ? 'RPC disconnected'
    : (snapshotError ??
      (!snapshot
        ? 'Initial snapshot unavailable'
        : snapshot && Date.now() - Date.parse(snapshot.network.computedAt) > 12 * 60_000
          ? 'Snapshot refresh overdue'
          : null));
app.get('/api/health', (_req, res) =>
  res
    .status(snapshotStatus() ? 503 : 200)
    .json({
      rpc: snapshotStatus() ? 'unavailable' : 'ok',
      mode: config.mode,
      lastSnapshotAt: snapshot?.network.computedAt ?? null,
      reason: snapshotStatus(),
      node: latestSample(),
    }),
);
app.get('/api/network', (_req, res) => {
  const reason = snapshotStatus();
  if (reason) {
    res.status(503).json({ status: 'unavailable', reason });
    return;
  }
  const net = snapshot!.network;
  const done = db
    .prepare(
      "SELECT count(*) n, min(charged_at) first, max(charged_at) last FROM tx_attempts WHERE status='settled' AND genesis=?",
    )
    .get(net.genesis) as any;
  const paid = (
    db.prepare("SELECT paid FROM payouts WHERE status='claimed' AND paid IS NOT NULL AND genesis=?").all(net.genesis) as any[]
  ).reduce((s, r) => s + BigInt(r.paid), 0n);
  res.json({
    ...net,
    keeper: { claims: done.n, paidPOT: decimal(paid), firstClaimAt: done.first, lastClaimAt: done.last },
  });
});
function ss58(raw: string, res: express.Response) {
  try {
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(raw)) throw new Error();
    const decoded = decodeAddress(raw);
    if (decoded.length !== 32) throw new Error();
    return encodeAddress(decoded, 42);
  } catch {
    res.status(400).json({ status: 'invalid', reason: 'Invalid SS58 account address' });
    return null;
  }
}
// Public and read-only, so any wallet or dApp may call it from the browser.
app.get('/api/status/:stash', (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  const stash = ss58(req.params.stash, res);
  if (!stash) return;
  const reason = snapshotStatus();
  if (reason) {
    res.status(503).json({ status: 'unavailable', reason });
    return;
  }
  const { network, payouts } = snapshot!,
    mine = payouts.filter((p) => p.validator === stash),
    unpaid = mine.filter((p) => !p.claimed),
    from = network.era.claimableFrom;
  res.set('X-Snapshot-Block', network.block.hash);
  res.json({
    stash,
    genesis: network.genesis,
    block: network.block.height,
    activeEra: network.era.active,
    window: { from, to: network.era.active - 1 },
    paidThrough: paidThrough(stash),
    earnedEras: new Set(mine.map((p) => p.era)).size,
    unpaid: unpaid.map(({ era, page, estimatedPOT, status }) => ({ era, page, estimatedPOT, expiring: status === 'expiring' })),
    keeperClaims: config.allowlist.includes(stash),
  });
});
// Anyone may send a payout. This builds the call for the visitor to sign with their own wallet in Node Console.
app.get('/api/claim/:stash', async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  const stash = ss58(req.params.stash, res);
  if (!stash) return;
  const reason = snapshotStatus();
  if (reason) {
    res.status(503).json({ status: 'unavailable', reason });
    return;
  }
  const era = req.query.era === undefined ? null : Number(req.query.era);
  const open = snapshot!.payouts
    .filter((p) => p.validator === stash && !p.claimed && (era === null || p.era === era))
    .sort((a, b) => a.era - b.era || a.page - b.page)
    .slice(0, 10);
  if (!open.length) {
    res.status(404).json({ status: 'none', reason: 'Nothing unclaimed for this validator' });
    return;
  }
  try {
    const { client } = await finalized();
    const calls = open.map((p) =>
      p.page >= 0
        ? client.tx.staking.payoutStakersByPage(stash, p.era, p.page)
        : client.tx.staking.payoutStakers(stash, p.era),
    );
    const callHex = (calls.length === 1 ? calls[0] : client.tx.utility.batch(calls)).method.toHex();
    res.json({
      stash,
      payouts: open.map(({ era, page }) => ({ era, page })),
      callHex,
      deepLink: consoleLink(client.genesisHash.toHex().toLowerCase(), callHex),
    });
  } catch (e) {
    res.status(503).json({ status: 'unavailable', reason: e instanceof Error ? e.message : String(e) });
  }
});
app.get('/api/nominator/:address', (req, res) => {
  const address = ss58(req.params.address, res);
  if (!address) return;
  const reason = snapshotStatus();
  if (reason) {
    res.status(503).json({ status: 'unavailable', reason });
    return;
  }
  const rows = getRewardRows(address),
    state = snapshot!,
    account = state.accounts.get(address);
  const targets = (account?.targets ?? []).map((stash: string) => ({
    stash,
    active: state.validators.has(stash),
    commissionPct: state.commissions.has(stash)
      ? percent(state.commissions.get(stash)!, 1_000_000_000n)
      : null,
  }));
  res.set('X-Snapshot-Block', state.network.block.hash);
  res.set('X-Snapshot-At', state.network.computedAt);
  const unclaimed = account?.validator
    ? (db
        .prepare(
          "SELECT era, page, status, estimate FROM payouts WHERE genesis=? AND validator=? AND status IN ('claimable','expiring','planned') ORDER BY era, page",
        )
        .all(state.network.genesis, address) as any[])
    : [];
  res.json({
    address,
    role: account?.validator ? 'validator' : account ? 'nominator' : 'none',
    bondedPOT: account ? decimal(account.bonded) : '0',
    unclaimed,
    keeperClaims: config.allowlist.includes(address),
    targets,
    allTargetsInactive: targets.length > 0 && targets.every((t: any) => !t.active),
    expiring: rows,
  });
});
app.get('/api/node', (_req, res) => res.json(latestSample()));
app.get('/api/alerts', (_req, res) =>
  res.json({
    channels: channels(),
    payouts: config.alertPayouts,
    expiryEras: config.alertExpiryEras,
    alerts: recentAlerts(),
  }),
);
app.get('/api/liveness', async (_req, res) => {
  try {
    const { at, hash } = await finalized();
    res.json(await liveness(at, hash.toHex()));
  } catch (e) {
    res.status(503).json({
      status: 'unavailable',
      reason: (e instanceof Error ? e.message : String(e)).replace(/[\r\n]+/g, ' ').slice(0, 240),
    });
  }
});
function rewards(req: express.Request, res: express.Response, validator?: string) {
  if (validator && !config.allowlist.includes(validator)) {
    res.status(403).json({ status: 'forbidden', reason: 'Validator is not allowlisted' });
    return;
  }
  const validators = validator ? [validator] : config.allowlist;
  const payouts = validators.flatMap((v) =>
    (db.prepare('SELECT * FROM payouts WHERE validator=? ORDER BY era DESC').all(v) as any[]).map((p) => ({
      ...p,
      paid: p.paid == null ? null : decimal(BigInt(p.paid)),
    })),
  );
  const attempts = validators.flatMap(
    (v) =>
      db
        .prepare(
          'SELECT id,validator,era,page,tx_hash,status,finalized_block,extrinsic_index,fee_actual,error,reserved_at FROM tx_attempts WHERE validator=? ORDER BY id DESC LIMIT 20',
        )
        .all(v) as any[],
  );
  res.json({
    validators: validators.map((v) => ({
      validator: v,
      eras: payouts.filter((p) => p.validator === v),
      keeper: getKeeperStatus(),
      recentAttempts: attempts.filter((a) => a.validator === v),
    })),
  });
}
app.get('/api/rewards', (req, res) => rewards(req, res));
app.get('/api/rewards/:validator', (req, res) => rewards(req, res, req.params.validator));
// A receipt proven against a finalized block cannot change.
const proven = new Map<number, any>();
app.get('/api/receipts', async (_req, res) => {
  try {
    const { client } = await finalized();
    const rows = db
      .prepare(
        'SELECT id,genesis,finalized_block AS blockHash,finalized_number AS blockNumber,extrinsic_index AS extrinsicIndex,tx_hash AS txHash,events FROM tx_attempts WHERE finalized_block IS NOT NULL ORDER BY id DESC',
      )
      .all() as any[];
    const check = async ({ id, events, ...ref }: any) => {
      if (proven.has(id)) return proven.get(id);
      const stored = { stored: { blockNumber: ref.blockNumber, rewardEvents: events ? JSON.parse(events) : [] } };
      if (ref.genesis.toLowerCase() !== client.genesisHash.toHex().toLowerCase()) {
        return { ...ref, ...stored, verified: false, reason: 'receipt genesis mismatch' };
      }
      let block: any, chainEvents: any[];
      try {
        block = await client.rpc.chain.getBlock(ref.blockHash);
        chainEvents = [...((await client.query.system.events.at(ref.blockHash)) as any)];
      } catch {
        return { ...ref, ...stored, verified: null, reason: 'block no longer served by this node; stored receipt shown' };
      }
      if (ref.blockNumber == null) {
        ref.blockNumber = block.block.header.number.toNumber();
        db.prepare('UPDATE tx_attempts SET finalized_number=? WHERE id=?').run(ref.blockNumber, id);
      }
      const extrinsic = block.block.extrinsics[ref.extrinsicIndex];
      if (!extrinsic || extrinsic.hash.toHex() !== ref.txHash) {
        return { ...ref, ...stored, verified: false, reason: 'extrinsic reference mismatch' };
      }
      const rewards = chainEvents.filter(
        (e) =>
          e.phase.isApplyExtrinsic &&
          e.phase.asApplyExtrinsic.toNumber() === ref.extrinsicIndex &&
          e.event.section === 'staking' &&
          (e.event.method === 'Reward' || e.event.method === 'Rewarded'),
      );
      const result = {
        ...ref,
        verified: rewards.length > 0,
        rewardEvents: rewards.length,
        ...(!rewards.length && { reason: 'no finalized staking.Reward events' }),
      };
      if (result.verified) proven.set(id, result);
      return result;
    };
    const verified = [];
    for (let i = 0; i < rows.length; i += 10) verified.push(...(await Promise.all(rows.slice(i, i + 10).map(check))));
    res.json(verified);
  } catch (e) {
    res
      .status(503)
      .json({
        status: 'unavailable',
        reason: (e instanceof Error ? e.message : String(e)).replace(/[\r\n]+/g, ' ').slice(0, 240),
      });
  }
});
const wizard = (fn: (req: express.Request) => Promise<unknown>) => async (req: express.Request, res: express.Response) => {
  try {
    res.json(await fn(req));
  } catch (e) {
    res.status(e instanceof Invalid ? 400 : 503).json({
      status: e instanceof Invalid ? 'invalid' : 'unavailable',
      reason: (e instanceof Error ? e.message : String(e)).replace(/[\r\n]+/g, ' ').slice(0, 300),
    });
  }
};
app.get('/api/wizard/preflight', wizard((req) => preflight(req.query.stash)));
app.get('/api/wizard/status', wizard((req) => wizardStatus(req.query.stash, req.query.keys)));
app.post('/api/wizard/build', wizard((req) => build(req.body)));
let claiming = false;
async function keep() {
  if (claiming || !getKeeperStatus().enabled) return;
  claiming = true;
  try {
    while ((await runOnce()).action === 'submitted');
    resolveAlert('keeper-error');
    await reportHealth().catch((e) => console.warn(`Health report failed: ${e instanceof Error ? e.message : e}`));
  } catch (e) {
    alert('keeper-error', 'keeper-error', 'warning', String(e));
  } finally {
    claiming = false;
  }
}
const refresh = () => void (getKeeperStatus().enabled ? keep() : collect());

if (config.mode === 'operator') {
  app.post('/api/keeper/enable', auth, (_req, res) => {
    try {
      enable();
      void keep();
      res.json(getKeeperStatus());
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });
  app.post('/api/keeper/disable', auth, (_req, res) => {
    disable();
    res.json(getKeeperStatus());
  });
  app.post('/api/keeper/claim-now', auth, async (_req, res) => {
    try {
      res.json(await runOnce());
      resolveAlert('keeper-error');
    } catch (e) {
      alert('keeper-error', 'keeper-error', 'warning', String(e));
      res.status(409).json({ error: (e as Error).message });
    }
  });
  app.put('/api/keeper/policy', auth, (req, res) => {
    try {
      setPolicy(req.body);
      res.json({ status: 'accepted', keeper: getKeeperStatus() });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });
  app.post('/api/wizard/rotate-keys', auth, wizard((req) => rotateKeys(req.body)));
  app.post('/api/alerts/test', auth, async (_req, res) => {
    if (!Object.values(channels()).some(Boolean)) {
      res.status(400).json({
        error:
          'No alert channel is set. Set PORTALNODE_TELEGRAM_BOT_TOKEN and PORTALNODE_TELEGRAM_CHAT_ID, or PORTALNODE_DISCORD_WEBHOOK.',
      });
      return;
    }
    res.json(await sendTest());
  });
}
const webDist = resolve(dirname(fileURLToPath(import.meta.url)), '../../web/dist');
if (existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^\/console(\/.*)?$/, (_req, res) => res.sendFile(resolve(webDist, 'index.html')));
}

async function start() {
  const client = await connect();
  await collect();
  await sampleNode();
  let session = -1;
  await client.rpc.chain.subscribeFinalizedHeads(async (head) => {
    try {
      const at = await client.at(head.hash),
        s = (at.query.session as any)?.currentIndex;
      const now = s ? Number((await s()).toString()) : -1;
      if (now !== session) {
        session = now;
        refresh();
      }
      resolveAlert('collector-session');
    } catch (e) {
      alert('collector-session', 'collector-error', 'warning', String(e));
    }
  });
  if (process.env.PORTALNODE_KEEPER === 'on') {
    enable();
    void keep();
  }
  setInterval(refresh, 10 * 60_000).unref();
  setInterval(() => void sampleNode(), 15_000).unref();
  setInterval(() => void watch(), 60_000).unref();
  app.listen(config.port, config.bind, () =>
    console.log(`PortalNode ${config.mode} listening on ${config.bind}:${config.port}`),
  );
}
void start().catch((e) => {
  console.error(`PortalNode startup failed: ${(e as Error).message}`);
  process.exit(1);
});

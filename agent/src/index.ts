import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, finalized, api } from './chain.js';
import { collect, snapshot, snapshotError, getRewardRows } from './collector.js';
import { config } from './config.js';
import { db, alert } from './db.js';
import { disable, enable, getKeeperStatus, runOnce, setPolicy } from './keeper.js';
import { latestSample, sampleNode } from './node-health.js';
import { decimal, percent } from './rewards.js';
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
  res.json(snapshot!.network);
});
app.get('/api/nominator/:address', (req, res) => {
  let address: string;
  try {
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(req.params.address)) throw new Error();
    const decoded = decodeAddress(req.params.address);
    if (decoded.length !== 32) throw new Error();
    address = encodeAddress(decoded, 42);
  } catch {
    res.status(400).json({ status: 'invalid', reason: 'Invalid SS58 account address' });
    return;
  }
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
  res.json({
    address,
    bondedPOT: account ? decimal(account.bonded) : '0',
    targets,
    allTargetsInactive: targets.length > 0 && targets.every((t: any) => !t.active),
    expiring: rows,
  });
});
app.get('/api/node', (_req, res) => res.json(latestSample()));
function rewards(req: express.Request, res: express.Response, validator?: string) {
  if (validator && !config.allowlist.includes(validator)) {
    res.status(403).json({ status: 'forbidden', reason: 'Validator is not allowlisted' });
    return;
  }
  const validators = validator ? [validator] : config.allowlist;
  const payouts = validators.flatMap(
    (v) => db.prepare('SELECT * FROM payouts WHERE validator=? ORDER BY era DESC').all(v) as any[],
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
app.get('/api/receipts', async (_req, res) => {
  try {
    const { client } = await finalized();
    const rows = db
      .prepare(
        'SELECT genesis,finalized_block AS blockHash,extrinsic_index AS extrinsicIndex,tx_hash AS txHash FROM tx_attempts WHERE finalized_block IS NOT NULL ORDER BY id DESC',
      )
      .all() as any[];
    const verified = [];
    for (const ref of rows) {
      if (ref.genesis.toLowerCase() !== client.genesisHash.toHex().toLowerCase()) {
        verified.push({ ...ref, verified: false, reason: 'receipt genesis mismatch' });
        continue;
      }
      const block = await client.rpc.chain.getBlock(ref.blockHash),
        extrinsic = block.block.extrinsics[ref.extrinsicIndex];
      if (!extrinsic || extrinsic.hash.toHex() !== ref.txHash) {
        verified.push({ ...ref, verified: false, reason: 'extrinsic reference mismatch' });
        continue;
      }
      const events: any[] = [...((await client.query.system.events.at(ref.blockHash)) as any)];
      const rewards = events.filter(
        (e) =>
          e.phase.isApplyExtrinsic &&
          e.phase.asApplyExtrinsic.toNumber() === ref.extrinsicIndex &&
          e.event.section === 'staking' &&
          e.event.method === 'Reward',
      );
      verified.push({
        ...ref,
        verified: rewards.length > 0,
        rewardEvents: rewards.length,
        ...(!rewards.length && { reason: 'no finalized staking.Reward events' }),
      });
    }
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
if (config.mode === 'operator') {
  app.post('/api/keeper/enable', auth, (_req, res) => {
    try {
      enable();
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
        void collect();
      }
    } catch (e) {
      alert('collector-session', 'collector-error', 'warning', String(e));
    }
  });
  setInterval(() => void collect(), 10 * 60_000).unref();
  setInterval(() => void sampleNode(), 15_000).unref();
  app.listen(config.port, '0.0.0.0', () =>
    console.log(`PortalNode ${config.mode} listening on 0.0.0.0:${config.port}`),
  );
}
void start().catch((e) => {
  console.error(`PortalNode startup failed: ${(e as Error).message}`);
  process.exit(1);
});

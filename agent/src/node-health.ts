import { ApiPromise, HttpProvider } from '@polkadot/api';
import { LEGACY_TYPES } from './chain.js';
import { config } from './config.js';
import { db } from './db.js';

let nodeApi: ApiPromise | null = null;
const errText = (e: unknown) =>
  (e instanceof Error ? e.message : String(e)).replace(/[\r\n]+/g, ' ').slice(0, 200);
async function metrics(url: string) {
  const r = await fetch(url, { signal: AbortSignal.timeout(3000) });
  if (!r.ok) throw new Error(`metrics HTTP ${r.status}`);
  const lines = (await r.text()).split('\n');
  const value = (predicate: (s: string) => boolean) => {
    const line = lines.find(predicate),
      m = line?.match(/\s([0-9]+(?:\.[0-9]+)?)\s*$/);
    return m ? Number(m[1]) : null;
  };
  return {
    peers: value((s) => s.startsWith('substrate_sub_libp2p_peers_count')),
    best: value((s) => s.startsWith('substrate_block_height') && s.includes('best')),
    finalized: value((s) => s.startsWith('substrate_block_height') && s.includes('finalized')),
  };
}
export async function sampleNode() {
  const sampled = new Date().toISOString();
  let reachable = 0,
    syncing: number | null = null,
    peers: number | null = null,
    best: number | null = null,
    finalized: number | null = null,
    age: number | null = null,
    heartbeat: number | null = null,
    authored: number | null = null,
    error: string | null = null;
  if (!config.nodeRpc && !config.metrics) return;
  if (config.nodeRpc) {
    try {
      if (!nodeApi) {
        nodeApi = new ApiPromise({
          provider: new HttpProvider(config.nodeRpc),
          typesBundle: LEGACY_TYPES,
        });
        await nodeApi.isReadyOrError;
      }
      const api = nodeApi,
        [health, syncResult, finalizedHash] = await Promise.all([
          api.rpc.system.health(),
          api.rpc.system.syncState(),
          api.rpc.chain.getFinalizedHead(),
        ]);
      if (config.genesis && api.genesisHash.toHex().toLowerCase() !== config.genesis)
        throw new Error('Local node RPC genesis mismatch');
      const sync: any = syncResult;
      const [header, at] = await Promise.all([api.rpc.chain.getHeader(finalizedHash), api.at(finalizedHash)]);
      reachable = 1;
      peers = health.peers.toNumber();
      best = sync.currentBlock.toNumber();
      syncing = sync.currentBlock.toNumber() < sync.highestBlock.toNumber() ? 1 : 0;
      finalized = header.number.toNumber();
      age = Math.max(
        0,
        Math.floor((Date.now() - Number((await at.query.timestamp.now()).toString())) / 1000),
      );
      const online = (at.query as any).imOnline;
      if (online?.receivedHeartbeats) {
        const rows = await online.receivedHeartbeats.entries();
        heartbeat = rows.some(([, v]: any) => v.isTrue) ? 1 : 0;
      }
      try {
        const [authorities, validators, authorship] = await Promise.all([
          at.query.babe.authorities(),
          at.query.session.validators(),
          api.rpc.babe.epochAuthorship(),
        ]);
        const authors: any = authorship.toJSON(),
          keys = [...(authorities as any)],
          stashes = [...(validators as any)];
        if (keys.length === stashes.length) {
          let total = 0,
            matched = false;
          for (let i = 0; i < keys.length; i++) {
            const publicKey = (keys[i] as any).toHex().slice(0, 66);
            if ((await api.rpc.author.hasKey(publicKey, 'babe')).isTrue) {
              matched = true;
              const record = authors[stashes[i].toString()];
              if (record)
                total +=
                  (record.primary?.length ?? 0) +
                  (record.secondaryPlain?.length ?? 0) +
                  (record.secondaryVrf?.length ?? 0);
            }
          }
          if (matched) authored = total;
        }
      } catch {}
    } catch (e) {
      error = errText(e);
      nodeApi?.disconnect().catch(() => {});
      nodeApi = null;
    }
  }
  if (config.metrics) {
    try {
      const m = await metrics(config.metrics);
      peers = m.peers ?? peers;
      best = m.best ?? best;
      finalized = m.finalized ?? finalized;
      reachable = 1;
    } catch (e) {
      error ??= errText(e);
    }
  }
  db.prepare(
    'INSERT OR REPLACE INTO node_samples(sampled_at,reachable,syncing,peers,best_height,finalized_height,finality_age,heartbeat_seen,authored_count,error) VALUES(?,?,?,?,?,?,?,?,?,?)',
  ).run(sampled, reachable, syncing, peers, best, finalized, age, heartbeat, authored, error);
  db.prepare("DELETE FROM node_samples WHERE julianday(sampled_at)<julianday('now','-7 days')").run();
}
export function latestSample() {
  return (
    db.prepare('SELECT * FROM node_samples ORDER BY sampled_at DESC LIMIT 1').get() ?? {
      reachable: null,
      syncing: null,
      peers: null,
      best_height: null,
      finalized_height: null,
      finality_age: null,
      heartbeat_seen: null,
      authored_count: null,
    }
  );
}

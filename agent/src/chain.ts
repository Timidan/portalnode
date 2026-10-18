import { ApiPromise, WsProvider } from '@polkadot/api';
import { config, MAINNET } from './config.js';
import { alert } from './db.js';

export type PayoutMode = 'whole-era' | 'explicit-page' | 'next-page' | 'none';
export type Capabilities = {
  payoutMode: PayoutMode;
  staking: boolean;
  imOnline: boolean;
  identity: boolean;
  fingerprint: string;
  runtime: { name: string; version: number; codeHash: string };
  gaps: string[];
};
export const LEGACY_TYPES = {
  spec: {
    portaldot: {
      types: [{ minmax: [0, undefined], types: { DispatchErrorModule: { index: 'u8', error: 'u8' } } }],
    },
  },
} as any;
export let api: ApiPromise | null = null;
export let capabilities: Capabilities | null = null;
const capabilityCache = new Map<string, Capabilities>();

export async function connect(): Promise<ApiPromise> {
  if (api?.isConnected) return api;
  const next = new ApiPromise({
    provider: new WsProvider(config.rpc, 2500, {}, 30_000),
    typesBundle: LEGACY_TYPES,
  });
  api = next;
  await next.isReadyOrError;
  const genesis = next.genesisHash.toHex().toLowerCase();
  if (config.genesis && config.genesis !== genesis) {
    alert('genesis-mismatch', 'genesis-mismatch', 'critical', `expected=${config.genesis} actual=${genesis}`);
    if (config.mode === 'operator') throw new Error('Configured genesis mismatch; operator writes refused');
  }
  if (config.mode === 'operator' && (!config.genesis || config.genesis !== genesis))
    throw new Error('Operator mode requires matching PORTALNODE_GENESIS');
  if (config.mode === 'operator' && genesis === MAINNET)
    throw new Error('Keeper signing on Portaldot mainnet is disabled in this round');
  return next;
}

const fingerprintOf = (client: ApiPromise, version: any, codeHash: any) =>
  `${client.genesisHash.toHex()}:${version.specName}:${version.specVersion}:${version.transactionVersion}:${codeHash.toHex()}`;

export function detect(
  client: ApiPromise,
  at: any,
  metadata: any,
  version: any,
  codeHash: any,
): Capabilities {
  const m = metadata.asLatest,
    palletList = [...m.pallets];
  const pallets = new Set(palletList.map((p) => p.name.toString().toLowerCase()));
  const staking = pallets.has('staking');
  const stakingCalls: any = client.tx.staking;
  const payout = typeof stakingCalls?.payoutStakers === 'function',
    byPage = typeof stakingCalls?.payoutStakersByPage === 'function';
  const paged = Boolean((at.query.staking as any)?.erasStakersOverview);
  const payoutMode: PayoutMode = byPage
    ? 'explicit-page'
    : payout && paged
      ? 'next-page'
      : payout
        ? 'whole-era'
        : 'none';
  const fingerprint = fingerprintOf(client, version, codeHash);
  const cached = capabilityCache.get(fingerprint);
  if (cached) return cached;
  const gaps = [
    !staking && 'staking absent',
    payoutMode === 'none' && 'payout call absent',
    !pallets.has('imonline') && 'imOnline absent',
  ].filter(Boolean) as string[];
  const result = {
    payoutMode,
    staking,
    imOnline: pallets.has('imonline'),
    identity: pallets.has('identity'),
    fingerprint,
    runtime: {
      name: version.specName.toString(),
      version: Number(version.specVersion.toString()),
      codeHash: codeHash.toHex(),
    },
    gaps,
  };
  capabilityCache.set(fingerprint, result);
  return result;
}

export async function finalized() {
  const client = await connect();
  const hash = await client.rpc.chain.getFinalizedHead();
  const [at, version, codeHash] = await Promise.all([
    client.at(hash),
    client.rpc.state.getRuntimeVersion(hash),
    client.rpc.state.getStorageHash('0x3a636f6465', hash),
  ]);
  const shape =
    capabilityCache.get(fingerprintOf(client, version, codeHash)) ??
    detect(client, at, await client.rpc.state.getMetadata(hash), version, codeHash);
  capabilities = shape;
  return { client, at, hash, shape };
}

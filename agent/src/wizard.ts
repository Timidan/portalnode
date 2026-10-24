import type { ApiPromise } from '@polkadot/api';
import { decodeAddress, encodeAddress } from '@polkadot/util-crypto';
import { finalized } from './chain.js';
import { config, MAINNET } from './config.js';
import { latestSample } from './node-health.js';
import { bondProblem, decimal, percent, POT } from './rewards.js';

export class Invalid extends Error {}
const KEY_NAMES: Record<string, string> = {
  gran: 'grandpa',
  babe: 'babe',
  imon: 'imOnline',
  audi: 'authorityDiscovery',
  mixn: 'mixnet',
  beef: 'beefy',
};
const PUBLIC_RPC: Record<string, string> = {
  [MAINNET]: 'wss://mainnet.portaldot.io',
  '0xd4f9acbcf7f52388d8b095abe3c198d19fc510e0343e643e87cfbccb155283bd': 'wss://test-node-v3.portaldot.dev',
};
const num = (x: any) => Number(x.toString());
const errText = (e: unknown) =>
  (e instanceof Error ? e.message : String(e)).replace(/[\r\n]+/g, ' ').slice(0, 240);

function ss58(value: unknown) {
  try {
    if (typeof value !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(value)) throw new Error();
    const decoded = decodeAddress(value);
    if (decoded.length !== 32) throw new Error();
    return encodeAddress(decoded, 42);
  } catch {
    throw new Invalid('Enter the stash as an SS58 account address');
  }
}
function hexOf(value: unknown, what: string) {
  if (typeof value !== 'string' || !/^0x([0-9a-fA-F]{2})*$/.test(value.trim()))
    throw new Invalid(`${what} must be 0x-prefixed hex`);
  return value.trim().toLowerCase();
}
function plancks(value: unknown) {
  const m = /^(\d{1,12})(?:\.(\d{1,14}))?$/.exec(String(value ?? '').trim());
  if (!m) throw new Invalid('Enter the bond as an amount with at most 14 decimals');
  return BigInt(m[1]) * POT + BigInt((m[2] ?? '').padEnd(14, '0'));
}
function perbillOf(value: unknown) {
  const pct = Number(value);
  if (value === '' || value === null || !Number.isFinite(pct) || pct < 0 || pct > 100)
    throw new Invalid('Commission must be a percentage from 0 to 100');
  return Math.round(pct * 10_000_000);
}

async function nodeSend(method: string, params: unknown[] = []) {
  const r = await fetch(config.nodeRpc!, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(20_000),
  });
  const body: any = await r.json();
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result;
}
async function onNode(keys: string): Promise<{ loaded: boolean | null; reason?: string }> {
  if (!config.nodeRpc)
    return { loaded: null, reason: 'PORTALNODE_NODE_RPC is not set, so the agent cannot ask a node' };
  try {
    return { loaded: Boolean(await nodeSend('author_hasSessionKeys', [keys])) };
  } catch (e) {
    return { loaded: null, reason: errText(e) };
  }
}

const unitOf = (client: ApiPromise) =>
  client.registry.getChainProperties()?.tokenSymbol.unwrapOr(null)?.[0]?.toString() ?? 'POT';
// Newer runtimes check a proof that the signer holds the session keys; their runtime API takes the owner.
const proofRequired = (client: ApiPromise) =>
  ((client.call as any).sessionKeys?.generateSessionKeys?.meta?.params?.length ?? 0) > 1;
const keysLength = (client: ApiPromise) =>
  client.registry.createType(client.tx.session.setKeys.meta.args[0].type.toString()).encodedLength;
async function keyParts(client: ApiPromise, keys: string) {
  const out: any = await (client.call as any).sessionKeys.decodeSessionKeys(keys);
  if (out.isNone) throw new Invalid('The runtime could not decode these session keys');
  return [...out.unwrap()].map(([key, id]: any[]) => {
    const t = Buffer.from(id.toU8a()).toString('latin1');
    return { type: KEY_NAMES[t] ?? t, keyTypeId: t, publicKey: key.toHex() };
  });
}

async function stashState(stashIn: unknown) {
  const stash = ss58(stashIn);
  const { client, at, hash, shape } = await finalized();
  if (!shape.staking) throw new Invalid('This runtime has no staking pallet');
  const q: any = at.query;
  const [bonded, account, minBond, maxBond] = await Promise.all([
    q.staking.bonded(stash),
    q.system.account(stash),
    q.staking.minValidatorBond?.() ?? null,
    q.staking.maxValidatorBond?.() ?? null,
  ]);
  const controller: string | null = bonded.isSome ? bonded.unwrap().toString() : null;
  const ledger = controller ? await q.staking.ledger(controller) : null;
  const ed = BigInt((at.consts.balances as any).existentialDeposit.toString());
  return {
    stash,
    client,
    at,
    hash,
    shape,
    controller,
    active: ledger?.isSome ? BigInt(ledger.unwrap().active.toString()) : null,
    free: BigInt(account.data.free.toString()),
    min: [ed, minBond ? BigInt(minBond.toString()) : 0n].reduce((a, b) => (a > b ? a : b)),
    max: maxBond ? BigInt(maxBond.toString()) : null,
    ed,
    unit: unitOf(client),
  };
}

function assemble(
  client: ApiPromise,
  o: { stash: string; value: bigint | null; commission: number; keys: string; proof: string },
) {
  const s: any = client.tx.staking;
  return client.tx.utility.batchAll([
    ...(o.value === null
      ? []
      : [s.bond.meta.args.length === 3 ? s.bond(o.stash, o.value, 'Staked') : s.bond(o.value, 'Staked')]),
    client.tx.session.setKeys(o.keys, o.proof),
    s.validate({ commission: o.commission, blocked: false }),
  ]);
}

export async function preflight(stashIn: unknown) {
  const st = await stashState(stashIn);
  const { client, at, hash, unit } = st,
    q: any = at.query,
    c: any = at.consts;
  const [chain, header, seats, candidates, sessionValidators, forceEra, nextKeys] = await Promise.all([
    client.rpc.system.chain(),
    client.rpc.chain.getHeader(hash),
    q.staking.validatorCount(),
    q.staking.validators.keys(),
    q.session.validators(),
    q.staking.forceEra(),
    q.session.nextKeys(st.stash),
  ]);
  const candidateList = candidates.map((k: any) => k.args[0].toString());
  const isCandidate = candidateList.includes(st.stash);
  const others = candidateList.filter((s: string) => s !== st.stash).length;
  const blockMs = c.babe?.expectedBlockTime ? num(c.babe.expectedBlockTime) : num(c.timestamp.minimumPeriod) * 2;
  const eraMs = c.babe?.epochDuration
    ? (forceEra.isForceAlways ? 1 : num(c.staking.sessionsPerEra)) * num(c.babe.epochDuration) * blockMs
    : null;
  const bondingEras = num(c.staking.bondingDuration),
    bondingDays = eraMs ? Math.round((bondingEras * eraMs) / 86_400_000) : null;
  const len = keysLength(client),
    types = (await keyParts(client, `0x${'00'.repeat(len)}`)).map((k) => k.type);
  const value = st.controller ? null : st.min;
  const fee = (
    await assemble(client, {
      stash: st.stash,
      value,
      commission: 0,
      keys: `0x${'00'.repeat(len)}`,
      proof: '0x',
    }).paymentInfo(st.controller ?? st.stash)
  ).partialFee.toBigInt();
  const node = latestSample() as any;
  const attached = Boolean(config.nodeRpc || config.metrics);
  const problem = st.active !== null ? bondProblem(st.active, st.min, st.max, unit) : null;
  const warnings: string[] = [];
  if (!attached)
    warnings.push(
      'No local node is attached to this agent, so it cannot generate session keys. Run the wizard on the box whose node will validate.',
    );
  else if (!node.reachable) warnings.push('The local node is not answering, so session keys cannot be generated yet.');
  else if (node.syncing) warnings.push('The local node is still syncing. A validator must be in sync before it is elected.');
  if (problem) warnings.push(`The bonded amount fails the chain's bond check: ${problem}.`);
  if (others >= num(seats))
    warnings.push(
      `Every validator seat is taken (${num(seats)} ${num(seats) === 1 ? 'seat' : 'seats'}, ${others} other ${others === 1 ? 'candidate' : 'candidates'}). A new validator is elected only if the seat count is raised or it has more backing stake than a current validator.`,
    );
  warnings.push(
    `Unbonding takes ${bondingEras} eras${bondingDays === null ? '' : ` (about ${bondingDays} days)`}: after you stop validating, the bond stays locked that long.`,
  );
  if (st.controller && st.controller !== st.stash)
    warnings.push(`This stash is bonded with a separate controller (${st.controller}); the controller signs the batch.`);
  if (!st.controller && st.free < st.min + fee)
    warnings.push(
      `The stash holds ${decimal(st.free)} ${unit}, less than the minimum bond plus fee (${decimal(st.min + fee)} ${unit}).`,
    );
  return {
    network: {
      name: chain.toString(),
      genesis: client.genesisHash.toHex(),
      runtime: `${st.shape.runtime.name} ${st.shape.runtime.version}`,
      block: header.number.toNumber(),
      unit,
    },
    node: attached
      ? {
          attached,
          reachable: node.reachable === null ? null : Boolean(node.reachable),
          syncing: node.syncing === null ? null : Boolean(node.syncing),
          peers: node.peers,
          finalized: node.finalized_height,
        }
      : { attached, reason: 'PORTALNODE_NODE_RPC and PORTALNODE_METRICS are not set' },
    stash: st.stash,
    controller: st.controller,
    bonded: st.controller !== null,
    activePOT: st.active === null ? null : decimal(st.active),
    candidate: isCandidate,
    nextKeys: nextKeys.isSome ? nextKeys.unwrap().toHex() : null,
    bounds: {
      minPOT: decimal(st.min),
      maxPOT: st.max === null ? null : decimal(st.max),
      existentialDepositPOT: decimal(st.ed),
      problem,
    },
    seats: { seats: num(seats), candidates: candidateList.length, active: sessionValidators.length },
    bonding: { eras: bondingEras, days: bondingDays },
    sessionKeys: { types, bytes: len, proofRequired: proofRequired(client) },
    freePOT: decimal(st.free),
    feeEstimatePOT: decimal(fee),
    warnings,
  };
}

export async function rotateKeys(body: any) {
  if (!config.nodeRpc)
    throw new Invalid(
      'No local node: PORTALNODE_NODE_RPC is not set, so there is no node to generate keys on. Keys must be generated on the node that will run them.',
    );
  const st = await stashState(body?.stash);
  const { client } = st;
  const nodeGenesis = String(await nodeSend('chain_getBlockHash', [0])).toLowerCase();
  if (nodeGenesis !== client.genesisHash.toHex().toLowerCase())
    throw new Invalid(`The local node is on another chain (genesis ${nodeGenesis})`);
  let keys: string,
    proof = '0x';
  if (proofRequired(client)) {
    const owner = client.createType('AccountId', st.controller ?? st.stash).toHex();
    const r = await nodeSend('author_rotateKeysWithOwner', [owner]);
    keys = r.keys;
    proof = r.proof;
  } else keys = await nodeSend('author_rotateKeys');
  return { keys, proof, decoded: await keyParts(client, keys) };
}

const rpcFor = (genesis: string) =>
  /^wss?:\/\/(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(config.rpc) ? (PUBLIC_RPC[genesis] ?? config.rpc) : config.rpc;
export const consoleLink = (genesis: string, callHex: string) =>
  `https://node-console.portaldot.dev/?rpc=${encodeURIComponent(rpcFor(genesis))}#/extrinsics/decode/${callHex}`;

export async function build(body: any) {
  const st = await stashState(body?.stash);
  const { client, unit } = st;
  const keys = hexOf(body?.keys, 'Session keys'),
    proof = body?.proof ? hexOf(body.proof, 'Proof') : '0x';
  const commission = perbillOf(body?.commissionPct);
  const len = keysLength(client);
  if (keys.length !== 2 + len * 2)
    throw new Invalid(`Session keys for this runtime are ${len} bytes; these are ${(keys.length - 2) / 2}`);
  const decodedKeys = await keyParts(client, keys);
  if (proofRequired(client) && proof === '0x')
    throw new Invalid(
      'This runtime checks that the signer owns the session keys. Generate them on your node with this stash (it returns a proof), or paste the proof with the keys.',
    );
  const value = st.controller ? null : plancks(body?.bondPOT);
  if (value === null && st.active === null) throw new Invalid('The stash is bonded but its ledger is missing');
  const problem = bondProblem(value ?? st.active!, st.min, st.max, unit);
  if (problem) throw new Invalid(`${problem}. The chain reports both bounds as InsufficientBond.`);
  const signer = st.controller ?? st.stash;
  const tx = assemble(client, { stash: st.stash, value, commission, keys, proof });
  const fee = (await tx.paymentInfo(signer)).partialFee.toBigInt();
  const calls = [...(tx.method.args[0] as any)].map((call: any) => ({
    pallet: call.section,
    method: call.method,
    args: Object.fromEntries(
      call.meta.args.map((a: any, i: number) => {
        const name = a.name.toString(),
          v = call.args[i];
        return [
          name,
          name === 'value'
            ? `${decimal(v.toBigInt())} ${unit}`
            : name === 'prefs'
              ? { commission: `${percent(BigInt(v.commission.unwrap().toString()), 1_000_000_000n)}%`, blocked: v.blocked.isTrue }
              : name === 'keys' || name === 'proof'
                ? v.toHex()
                : v.toHuman(),
        ];
      }),
    ),
  }));
  const warnings: string[] = [];
  if (st.free < (value ?? 0n) + fee)
    warnings.push(
      `The stash holds ${decimal(st.free)} ${unit}, less than the bond plus fee (${decimal((value ?? 0n) + fee)} ${unit}); the batch would fail.`,
    );
  const callHex = tx.method.toHex(),
    genesis = client.genesisHash.toHex().toLowerCase();
  const rpc = rpcFor(genesis);
  return {
    callHex,
    signer,
    signerRole: signer === st.stash ? 'stash' : 'controller',
    calls,
    keys: decodedKeys,
    keysOnNode: await onNode(keys),
    feePOT: decimal(fee),
    unit,
    rpc,
    deepLink: consoleLink(genesis, callHex),
    warnings,
  };
}

export async function status(stashIn: unknown, submitted?: unknown) {
  const st = await stashState(stashIn);
  const q: any = st.at.query;
  const [candidates, nextKeys, queued, active, session, header] = await Promise.all([
    q.staking.validators.keys(),
    q.session.nextKeys(st.stash),
    q.session.queuedKeys(),
    q.session.validators(),
    q.session.currentIndex(),
    st.client.rpc.chain.getHeader(st.hash),
  ]);
  const candidate = candidates.some((k: any) => k.args[0].toString() === st.stash);
  const prefs = candidate ? await q.staking.validators(st.stash) : null;
  const next: string | null = nextKeys.isSome ? nextKeys.unwrap().toHex() : null;
  const isQueued = [...queued].some(([who]: any[]) => who.toString() === st.stash),
    isActive = [...active].some((who: any) => who.toString() === st.stash);
  return {
    stash: st.stash,
    block: header.number.toNumber(),
    session: num(session),
    bonded: st.controller !== null,
    controller: st.controller,
    activePOT: st.active === null ? null : decimal(st.active),
    candidate,
    commissionPct: prefs ? percent(BigInt(prefs.commission.unwrap().toString()), 1_000_000_000n) : null,
    nextKeys: next,
    matchesSubmitted: typeof submitted === 'string' && submitted ? next === hexOf(submitted, 'Keys') : null,
    keysOnNode: next ? await onNode(next) : { loaded: null, reason: 'No session keys are set on chain for this stash' },
    queued: isQueued,
    active: isActive,
    phase: isActive ? 'active' : isQueued ? 'queued' : candidate ? 'candidate' : st.controller ? 'bonded' : 'none',
  };
}

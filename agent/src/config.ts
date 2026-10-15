import { readFileSync, statSync } from 'node:fs';
import { decodeAddress, encodeAddress } from '@polkadot/util-crypto';

export const MAINNET = '0x83b5212c69f85f3996f8696bb35bf913af51b176a5f53d0a74fd3a83dc0b8a54';
const mode = process.env.PORTALNODE_MODE ?? 'observer';
if (mode !== 'operator' && mode !== 'observer')
  throw new Error('PORTALNODE_MODE must be operator or observer');
const port = Number(process.env.PORT ?? 8080);
function localHttp(name: string, value: string | undefined) {
  if (!value) return undefined;
  const url = new URL(value);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname)
  )
    throw new Error(`${name} must use a loopback HTTP URL`);
  return value;
}
const allowlist = (process.env.PORTALNODE_ALLOWLIST ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .map((address) => {
    const decoded = decodeAddress(address);
    if (decoded.length !== 32)
      throw new Error(`Invalid validator address in PORTALNODE_ALLOWLIST: ${address}`);
    return encodeAddress(decoded, 42);
  });
export const config = {
  mode,
  port,
  rpc: process.env.PORTALNODE_RPC ?? 'ws://127.0.0.1:9944',
  nodeRpc: localHttp('PORTALNODE_NODE_RPC', process.env.PORTALNODE_NODE_RPC),
  metrics: localHttp('PORTALNODE_METRICS', process.env.PORTALNODE_METRICS),
  genesis: process.env.PORTALNODE_GENESIS?.toLowerCase(),
  keyFile: process.env.PORTALNODE_KEEPER_FILE,
  allowlist,
  token: process.env.PORTALNODE_TOKEN,
  db: process.env.PORTALNODE_DB ?? './portalnode.sqlite',
  allowedHosts: (process.env.PORTALNODE_ALLOWED_HOSTS ?? 'localhost,127.0.0.1')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  allowedOrigins: (
    process.env.PORTALNODE_ALLOWED_ORIGINS ?? `http://localhost:${port},http://127.0.0.1:${port}`
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};
if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) throw new Error('Invalid PORT');
export function loadKeeper(): { suri: string } | null {
  if (!config.keyFile) return null;
  if ((statSync(config.keyFile).mode & 0o077) !== 0)
    throw new Error('Keeper file must be owner-only (chmod 600)');
  const parsed = JSON.parse(readFileSync(config.keyFile, 'utf8')) as { suri?: string; secretPhrase?: string };
  const suri = parsed.suri ?? parsed.secretPhrase;
  if (!suri) throw new Error('Keeper JSON needs secretPhrase or suri');
  return { suri };
}

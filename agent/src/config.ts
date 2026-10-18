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
  telegram: telegram(process.env.PORTALNODE_TELEGRAM_BOT_TOKEN, process.env.PORTALNODE_TELEGRAM_CHAT_ID),
  discordWebhook: discord(process.env.PORTALNODE_DISCORD_WEBHOOK),
  alertPayouts: process.env.PORTALNODE_ALERT_PAYOUTS === 'on',
  alertExpiryEras: Number(process.env.PORTALNODE_ALERT_EXPIRY_ERAS || 7),
  upstreamCheck: process.env.PORTALNODE_UPSTREAM_CHECK !== 'off',
  upstreamCommit: process.env.PORTALNODE_UPSTREAM_COMMIT ?? '1ff0b2b3dc85925a91c6f1483567582fca0c79cd',
};
if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) throw new Error('Invalid PORT');
if (!Number.isInteger(config.alertExpiryEras) || config.alertExpiryEras < 1)
  throw new Error('PORTALNODE_ALERT_EXPIRY_ERAS must be a whole number of eras');
function telegram(token: string | undefined, chatId: string | undefined) {
  if (!token && !chatId) return undefined;
  if (!token || !chatId)
    throw new Error('Set both PORTALNODE_TELEGRAM_BOT_TOKEN and PORTALNODE_TELEGRAM_CHAT_ID');
  if (!/^\d+:[\w-]{30,}$/.test(token)) throw new Error('PORTALNODE_TELEGRAM_BOT_TOKEN is not a bot token');
  if (!/^(-?\d+|@\w{5,})$/.test(chatId))
    throw new Error('PORTALNODE_TELEGRAM_CHAT_ID must be a numeric chat id or an @channel name');
  return { token, chatId };
}
function discord(value: string | undefined) {
  if (!value) return undefined;
  let url: URL | undefined;
  try {
    url = new URL(value);
  } catch {}
  if (
    url?.protocol !== 'https:' ||
    url.port ||
    !['discord.com', 'discordapp.com'].includes(url.hostname) ||
    !/^\/api\/(v\d+\/)?webhooks\/\d+\/[\w-]+$/.test(url.pathname)
  )
    throw new Error('PORTALNODE_DISCORD_WEBHOOK must be an https://discord.com/api/webhooks/ URL');
  return url.href;
}
export function loadKeeper(): { suri: string } | null {
  if (!config.keyFile) return null;
  if ((statSync(config.keyFile).mode & 0o077) !== 0)
    throw new Error('Keeper file must be owner-only (chmod 600)');
  const parsed = JSON.parse(readFileSync(config.keyFile, 'utf8')) as { suri?: string; secretPhrase?: string };
  const suri = parsed.suri ?? parsed.secretPhrase;
  if (!suri) throw new Error('Keeper JSON needs secretPhrase or suri');
  return { suri };
}

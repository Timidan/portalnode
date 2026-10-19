// First-run setup: asks a few questions, then writes .env, secrets/keeper.json and state/ into the deploy folder.
import { chmodSync, chownSync, copyFileSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { ApiPromise, WsProvider } from '@polkadot/api';
import { Keyring } from '@polkadot/keyring';
import { cryptoWaitReady, decodeAddress, encodeAddress, mnemonicGenerate } from '@polkadot/util-crypto';

const DIR = process.argv[2] ?? '/config';
const MAINNET = '0x83b5212c69f85f3996f8696bb35bf913af51b176a5f53d0a74fd3a83dc0b8a54';
const PUBLIC = { mainnet: 'wss://mainnet.portaldot.io', v3: 'wss://test-node-v3.portaldot.dev' };
const rl = createInterface({ input: process.stdin, output: process.stdout });
const say = (s = '') => console.log(s);
const ask = async (q: string, def = '') => (await rl.question(def ? `${q} [${def}]: ` : `${q}: `)).trim() || def;
const yes = async (q: string, def = true) => /^y/i.test(await ask(`${q} (y/n)`, def ? 'y' : 'n'));
async function choose(q: string, options: string[], def = 1) {
  say(q);
  options.forEach((o, i) => say(`  ${i + 1}) ${o}`));
  for (;;) {
    const n = Number(await ask('Choose', String(def)));
    if (n >= 1 && n <= options.length) return n;
  }
}
const owner = statSync(DIR);
function writePrivate(path: string, body: string) {
  writeFileSync(path, body, { mode: 0o600 });
  chmodSync(path, 0o600);
  if (process.getuid?.() === 0) chownSync(path, owner.uid, owner.gid);
}
function ensureDir(path: string, mode: number) {
  mkdirSync(path, { recursive: true, mode });
  if (process.getuid?.() === 0) chownSync(path, owner.uid, owner.gid);
}

async function telegramSetup() {
  say('\nTelegram, in three steps:');
  say('  1. In Telegram, open @BotFather (blue tick) and send /newbot. Pick a name and a username ending in "bot".');
  say('  2. BotFather replies with a token like 1234567890:AAH... Paste it here.');
  say('  3. Open your new bot, press Start and send it any message. PortalNode then finds your chat by itself.');
  for (;;) {
    const token = await ask('Bot token');
    if (!/^\d+:[\w-]{30,}$/.test(token)) {
      say('That is not a bot token. It looks like 1234567890:AAH...');
      continue;
    }
    const tg = async (method: string) =>
      (await (await fetch(`https://api.telegram.org/bot${token}/${method}`, { signal: AbortSignal.timeout(15_000) })).json()) as any;
    const me = await tg('getMe').catch(() => null);
    if (!me?.ok) {
      say('Telegram did not accept that token. Check it and try again.');
      continue;
    }
    say(`Bot @${me.result.username} found. Now open https://t.me/${me.result.username}, press Start and send it a message.`);
    for (let i = 0; i < 60; i++) {
      const chats = new Map<string, string>();
      for (const u of (await tg('getUpdates').catch(() => ({ result: [] }))).result ?? []) {
        const c = (u.message ?? u.channel_post ?? u.my_chat_member)?.chat;
        if (c) chats.set(String(c.id), c.title ?? c.first_name ?? c.username ?? String(c.id));
      }
      if (chats.size) {
        const list = [...chats];
        const pick = list.length === 1 ? 1 : await choose('Which chat should get alerts?', list.map(([id, n]) => `${n} (${id})`));
        say(`Alerts will go to ${list[pick - 1][1]}.`);
        return { token, chatId: list[pick - 1][0] };
      }
      if (i % 5 === 0) say('  waiting for your message to the bot...');
      await new Promise((r) => setTimeout(r, 3000));
    }
    say('No message reached the bot in 3 minutes.');
    if (!(await yes('Try again?'))) return null;
  }
}

async function discordSetup() {
  say('\nDiscord: in your server, open Server Settings > Integrations > Webhooks > New Webhook, pick the channel, then Copy Webhook URL.');
  for (;;) {
    const url = await ask('Webhook URL');
    try {
      const u = new URL(url);
      if (u.protocol === 'https:' && !u.port && ['discord.com', 'discordapp.com'].includes(u.hostname) && /^\/api\/(v\d+\/)?webhooks\/\d+\/[\w-]+$/.test(u.pathname))
        return u.href;
    } catch {}
    say('That is not a Discord webhook URL. It starts with https://discord.com/api/webhooks/');
  }
}

async function sendTest(telegram: { token: string; chatId: string } | null, discord: string | null, chain: string) {
  const message = `PortalNode on ${chain}: test alert. Alerts for your validators will arrive here.`;
  if (telegram) {
    const r = await fetch(`https://api.telegram.org/bot${telegram.token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: telegram.chatId, text: message }),
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null);
    say(r?.ok ? '  Telegram: test alert sent.' : '  Telegram: the test alert failed. Check the bot and chat, then re-run setup.');
  }
  if (discord) {
    const r = await fetch(discord, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: message }),
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null);
    say(r?.ok ? '  Discord: test alert sent.' : '  Discord: the test alert failed. Check the webhook URL, then re-run setup.');
  }
}

async function main() {
  await cryptoWaitReady();
  say('PortalNode setup. It writes .env, secrets/ and state/ in this folder; nothing leaves this machine except the test alerts.\n');
  const envPath = join(DIR, '.env');
  if (existsSync(envPath)) {
    if (!(await yes('A .env already exists. Replace it (the old one is kept as .env.bak)?', false))) return;
    copyFileSync(envPath, join(DIR, '.env.bak'));
  }

  const shape = await choose('How will PortalNode run?', [
    'Add-on: next to a Portaldot node I already run, or against a public RPC',
    'Full: also run a Portaldot mainnet node here (the first sync takes about a day)',
  ]);
  let rpc = PUBLIC.mainnet;
  if (shape === 1) {
    const source = await choose('Which chain should it read?', [
      'My node on this machine (ws://127.0.0.1:9944)',
      'Portaldot mainnet, public RPC',
      'Portaldot V3 testnet, public RPC',
      'Another WebSocket URL',
    ]);
    rpc = [ 'ws://127.0.0.1:9944', PUBLIC.mainnet, PUBLIC.v3, ''][source - 1] || (await ask('WebSocket URL (wss://...)'));
  }
  say(`\nConnecting to ${rpc} ...`);
  const api = await ApiPromise.create({ provider: new WsProvider(rpc, 2000, {}, 60_000), noInitWarn: true, throwOnConnect: true });
  const genesis = api.genesisHash.toHex();
  const chain = genesis === MAINNET ? 'Portaldot mainnet' : (await api.rpc.system.chain()).toString();
  say(`Connected: ${chain}, runtime ${api.runtimeVersion.specName} ${api.runtimeVersion.specVersion}.`);

  const candidates = new Set([...(await api.query.staking.validators.keys())].map((k) => encodeAddress(k.args[0] as any, 42)));
  let allowlist: string[] = [];
  for (;;) {
    const raw = await ask('\nValidator stash addresses to watch, comma-separated (leave empty to only watch the network)');
    try {
      allowlist = raw.split(',').map((s) => s.trim()).filter(Boolean).map((a) => encodeAddress(decodeAddress(a), 42));
    } catch {
      say('One of those is not a valid address. Try again.');
      continue;
    }
    const unknown = allowlist.filter((a) => !candidates.has(a));
    if (!unknown.length || (await yes(`Not validator candidates on ${chain} right now: ${unknown.join(', ')}. Keep them anyway?`, false))) break;
  }

  let keeper = false;
  if (!allowlist.length) say('No validators given, so the keeper stays off and PortalNode watches the network.');
  else if (genesis === MAINNET) say('Claiming on mainnet is switched off in this release, so PortalNode watches and alerts.');
  else keeper = await yes('\nShould PortalNode claim payouts for these validators (the keeper)?');

  ensureDir(join(DIR, 'secrets'), 0o700);
  ensureDir(join(DIR, 'state'), 0o700);
  const keyPath = join(DIR, 'secrets', 'keeper.json');
  if (keeper) {
    if (existsSync(keyPath) && (await yes('Use the keeper key already in secrets/keeper.json?'))) say('Keeping the existing key.');
    else {
      const phrase = mnemonicGenerate(12),
        address = new Keyring({ type: 'sr25519', ss58Format: 42 }).addFromUri(phrase).address;
      writePrivate(keyPath, JSON.stringify({ secretPhrase: phrase, ss58Address: address }, null, 2) + '\n');
      say(`New keeper key: ${address}`);
      say('Send it about 5 tokens for fees. It only pays fees; rewards go to the validators and their nominators.');
    }
  }

  say('\nAlerts go to Telegram, Discord or both. They fire when a problem starts and when it clears.');
  const telegram = (await yes('Set up Telegram?')) ? await telegramSetup() : null;
  const discord = (await yes('Set up Discord?', false)) ? await discordSetup() : null;
  const payouts = (telegram || discord) && keeper ? await yes('Also send a message for each payout the keeper claims?') : false;

  const token = randomBytes(32).toString('hex');
  const lines = [
    `# Written by PortalNode setup on ${new Date().toISOString()}. Edit freely, or run setup again.`,
    `PORTALNODE_PROFILE=${shape === 1 ? 'addon' : 'full'}`,
    `PORTALNODE_MODE=${keeper ? 'operator' : 'observer'}`,
    shape === 1 ? `PORTALNODE_RPC=${rpc}` : '',
    shape === 1 && rpc.startsWith('ws://127.0.0.1') ? 'PORTALNODE_NODE_RPC=http://127.0.0.1:9933\nPORTALNODE_METRICS=http://127.0.0.1:9615/metrics' : '',
    `PORTALNODE_GENESIS=${genesis}`,
    `PORTALNODE_ALLOWLIST=${allowlist.join(',')}`,
    `PORTALNODE_TOKEN=${token}`,
    keeper ? 'PORTALNODE_KEEPER_FILE=/run/secrets/keeper.json\nPORTALNODE_KEEPER=on\nPORTALNODE_MAX_FEE=1\nPORTALNODE_BUDGET_24H=5\nPORTALNODE_MIN_RESERVE=1' : '',
    telegram ? `PORTALNODE_TELEGRAM_BOT_TOKEN=${telegram.token}\nPORTALNODE_TELEGRAM_CHAT_ID=${telegram.chatId}` : '',
    discord ? `PORTALNODE_DISCORD_WEBHOOK=${discord}` : '',
    payouts ? 'PORTALNODE_ALERT_PAYOUTS=on' : '',
    `PORTALNODE_UID=${owner.uid}`,
    `PORTALNODE_GID=${owner.gid}`,
  ].filter(Boolean);
  writePrivate(envPath, lines.join('\n') + '\n');
  await api.disconnect();

  if (telegram || discord) {
    say('\nSending test alerts ...');
    await sendTest(telegram, discord, chain);
  }
  const profile = shape === 1 ? 'addon' : 'full';
  say(`\nDone. Start PortalNode with:\n\n  docker compose --profile ${profile} up -d --build\n`);
  say('Then open http://127.0.0.1:8080/console on this machine, or from your laptop through a tunnel:');
  say('  ssh -L 8080:127.0.0.1:8080 your-server');
  say(`\nConsole token for the keeper controls (also in .env as PORTALNODE_TOKEN):\n  ${token}`);
}

main()
  .catch((e) => {
    console.error(`Setup stopped: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  })
  .finally(() => {
    rl.close();
    setTimeout(() => process.exit(), 100);
  });

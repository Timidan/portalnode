import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

const token = `123456:${'A'.repeat(35)}`;
Object.assign(process.env, {
  PORTALNODE_DB: ':memory:',
  PORTALNODE_TELEGRAM_BOT_TOKEN: token,
  PORTALNODE_TELEGRAM_CHAT_ID: '-100',
  PORTALNODE_DISCORD_WEBHOOK: 'https://discord.com/api/webhooks/1/hook-secret',
});
const sent: string[] = [];
let down = false;
mock.method(globalThis, 'fetch', async (url: string, init: any) => {
  if (down) throw new TypeError(`Failed to parse URL from ${url}`);
  const body = JSON.parse(init.body);
  sent.push(body.text ?? body.content);
  return new Response(null, { status: 204 });
});
const { alert, resolveAlert } = await import('./db.js');
const { flush, send } = await import('./notify.js');

test('one message per state change, one recovery, flaps held back', async () => {
  alert('k', 'low-reserve', 'critical', 'balance low, see https://example.org/x');
  alert('k', 'low-reserve', 'critical', 'still low');
  await flush();
  assert.equal(sent.length, 2);
  assert.match(sent[0], /CRITICAL\nKeeper balance fell/);
  assert.doesNotMatch(sent[0], /example\.org/);
  resolveAlert('k');
  resolveAlert('k');
  await flush();
  assert.equal(sent.length, 4);
  assert.match(sent[3], /RECOVERED/);
  alert('k', 'low-reserve', 'critical', 'low again within the cooldown');
  await flush();
  assert.equal(sent.length, 4);
});

test('channel errors never carry the token or webhook', async () => {
  down = true;
  const result = await send('x');
  assert.equal(result.telegram.ok, false);
  assert.doesNotMatch(JSON.stringify(result), /AAAAA|hook-secret/);
});

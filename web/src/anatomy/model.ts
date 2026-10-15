/** Illustrative runtime parameters from the brief, not a live chain snapshot. */
export const CLOCK = Object.freeze({ blockSeconds: 60, sessionHours: 2, sessionsPerEra: 6, historyDepth: 84 });
export const ERA_HOURS = CLOCK.sessionHours * CLOCK.sessionsPerEra;
export const DIAL_TICKS = ERA_HOURS * 5;
export const TOUR_SECONDS = 30;
export const STOPS = [0, 6, 9, 12, 15, 16, 18, 20, 23, 27] as const;
export const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));
export const ease = (a: number, b: number, t: number) => { const x = clamp((t - a) / (b - a)); return x * x * (3 - 2 * x); };
export type ClaimState = 'open' | 'unpunched' | 'armed' | 'punched' | 'filed' | 'expired';
export function modelAt(seconds: number) {
  const t = clamp(seconds, 0, TOUR_SECONDS);
  const shift = ease(0, 7, t);
  const drop = ease(7.5, 9.5, t);
  const draw = ease(10, 12.5, t);
  const arm = ease(13, 14.5, t) * (1 - ease(20, 21, t));
  const punch = ease(15, 16, t) * (1 - ease(17, 18, t));
  const filed = ease(20, 23, t);
  const expiry = ease(25, 27.5, t);
  const state: ClaimState = t < 7 ? 'open' : t < 13 ? 'unpunched' : t < 16 ? 'armed' : t < 22.5 ? 'punched' : t < 25 ? 'filed' : 'expired';
  return { t, shift, drop, draw, arm, punch, filed, expiry, state,
    session: Math.min(CLOCK.sessionsPerEra, Math.floor(shift * CLOCK.sessionsPerEra) + 1),
    claimMarked: t >= 16, receiptRecorded: t >= 22.5, oldCardAge: t < 25 ? CLOCK.historyDepth : CLOCK.historyDepth + 1,
    tape: t < 7 ? shift * ERA_HOURS * 3600 / CLOCK.blockSeconds : ERA_HOURS * 3600 / CLOCK.blockSeconds,
    coin: ease(17.5, 20.5, t), bell: t >= 22.5 && t < 24.8 ? Math.sin((t - 22.5) * 17) * Math.exp(-(t - 22.5) * 2.6) : 0,
  };
}
export type ClockModel = ReturnType<typeof modelAt>;
export function readoutOf(m: ClockModel) {
  if (m.state === 'expired') return `Missed claim · ${m.oldCardAge} > ${CLOCK.historyDepth} eras`;
  if (m.state === 'open') return `Model · session ${m.session}/${CLOCK.sessionsPerEra} · ${ERA_HOURS} h shift`;
  if (m.state === 'unpunched') return 'Model · era closed · card unpunched';
  if (m.state === 'armed') return 'Model · keeper key · punch armed';
  if (m.state === 'filed') return 'Model · receipt filed · alert raised';
  return m.coin < 1 ? 'Model · claimed · both payouts' : 'Model · punched card → receipt';
}
export const CAPTION = `A night-shift punch clock for staking rewards. Blocks arrive every ${CLOCK.blockSeconds} seconds; ${CLOCK.sessionsPerEra} sessions of ${CLOCK.sessionHours} hours close one era. The keeper signs payout_stakers with its own small hot key, pays the validator and nominators, then files a receipt and raises an alert. The separate missed-claim example falls out after ${CLOCK.historyDepth} eras. The stash key stays outside. Time and coins are illustrative; no live chain values or payout proportions are shown.`;

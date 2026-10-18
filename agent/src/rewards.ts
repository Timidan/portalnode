// Ported from the 13 Oct PortalNode design lab; validated against runtime 1002 Reward events.
const BILLION = 1_000_000_000n;
export const POT = 100_000_000_000_000n;
export function perbill(n: bigint, d: bigint): bigint {
  d = d < 1n ? 1n : d;
  n = n > d ? d : n;
  const factor = (d + BILLION - 1n) / BILLION;
  return ((n / factor) * BILLION) / (d / factor);
}
export function mul(parts: bigint, amount: bigint): bigint {
  const product = parts * amount;
  return product / BILLION + (product % BILLION > BILLION / 2n ? 1n : 0n);
}
export function grossReward(
  points: bigint,
  totalPoints: bigint,
  stake: bigint,
  eraStake: bigint,
  payout: bigint,
  ed: bigint,
): bigint {
  return points === 0n ? 0n : mul(perbill(points * ed + stake, totalPoints * ed + eraStake), payout);
}
export function nominatorReward(gross: bigint, commission: bigint, value: bigint, total: bigint): bigint {
  return mul(perbill(value, total), gross - mul(commission, gross));
}
export function decimal(n: bigint, denominator = POT, digits = 4): string {
  if (denominator <= 0n) throw new Error('Invalid display denominator');
  const scale = 10n ** BigInt(digits),
    rounded = (n * scale + denominator / 2n) / denominator;
  const fraction = (rounded % scale).toString().padStart(digits, '0').replace(/0+$/, '');
  return `${rounded / scale}${fraction ? `.${fraction}` : ''}`;
}
export function percent(n: bigint, d: bigint): number {
  return Number(decimal(n * 100n, d));
}
export function bondProblem(active: bigint, min: bigint, max: bigint | null, unit = 'POT'): string | null {
  if (active < min)
    return `${decimal(active)} ${unit} is under the minimum validator bond of ${decimal(min)} ${unit}, short by ${decimal(min - active)} ${unit}`;
  if (max !== null && active > max)
    return `${decimal(active)} ${unit} is over the maximum validator bond of ${decimal(max)} ${unit}, by ${decimal(active - max)} ${unit}`;
  return null;
}

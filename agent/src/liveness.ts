const num = (x: any) => Number(x.toString());

// pallet-im-online: online for the session = a heartbeat was received OR it authored a block.
export function status(heartbeat: boolean | null, authoredBlocks: number, pastHeartbeatAfter: boolean) {
  const isOnline = authoredBlocks > 0 ? true : heartbeat;
  return { isOnline, atRisk: isOnline === false && pastHeartbeatAfter };
}

export async function liveness(at: any, hash: string) {
  const q = at.query;
  if (!q.imOnline?.authoredBlocks || !q.session?.validators) throw new Error('imOnline is absent on this runtime');
  const [height, index, validators, keys, heartbeatAfter, activeEra, epochIndex, currentSlot, genesisSlot] =
    await Promise.all([
      q.system.number(),
      q.session.currentIndex(),
      q.session.validators(),
      q.imOnline.keys(),
      q.imOnline.heartbeatAfter(),
      q.staking?.activeEra?.() ?? null,
      q.babe?.epochIndex?.() ?? null,
      q.babe?.currentSlot?.() ?? null,
      q.babe?.genesisSlot?.() ?? null,
    ]);
  const session = num(index),
    stashes = [...validators].map(String),
    duration = at.consts.babe?.epochDuration ? num(at.consts.babe.epochDuration) : null;
  const [points, heartbeats, authored] = await Promise.all([
    activeEra?.isSome ? q.staking.erasRewardPoints(activeEra.unwrap().index) : null,
    keys.length === stashes.length ? q.imOnline.receivedHeartbeats.multi(stashes.map((_, i) => [session, i])) : null,
    q.imOnline.authoredBlocks.multi(stashes.map((s) => [session, s])),
  ]);
  // BABE ends the session at the first slot past the epoch; counted in slots, which equal blocks when none are empty.
  const left =
    duration && epochIndex && currentSlot && genesisSlot
      ? num(genesisSlot) + (num(epochIndex) + 1) * duration - num(currentSlot)
      : null;
  const eraPoints = new Map([...(points?.individual ?? [])].map(([who, p]: any[]) => [String(who), num(p)]));
  const late = num(height) >= num(heartbeatAfter);
  return {
    block: { height: num(height), hash },
    session,
    heartbeatAfter: num(heartbeatAfter),
    blocksLeftInSession: left !== null && left >= 0 && left <= duration! ? left : null,
    validators: stashes.map((stash, i) => {
      const authoredBlocks = num(authored[i]),
        heartbeat: boolean | null = heartbeats ? heartbeats[i].isSome : null;
      return {
        stash,
        authoredBlocks,
        heartbeat,
        ...status(heartbeat, authoredBlocks, late),
        eraPoints: points ? (eraPoints.get(stash) ?? 0) : null,
      };
    }),
  };
}

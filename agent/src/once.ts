import { connect } from './chain.js';
import { collect, snapshot } from './collector.js';
import { runOnce } from './keeper.js';

try {
  await connect();
  await collect();
  // The explicit one-shot command is an operator action; policy and chain checks still gate signing.
  const result = await runOnce(true);
  console.log(
    JSON.stringify(
      {
        chain: snapshot
          ? {
              genesis: snapshot.network.genesis,
              block: snapshot.network.block,
              era: snapshot.network.era,
              payoutMode: snapshot.capabilities.payoutMode,
            }
          : null,
        result,
      },
      null,
      2,
    ),
  );
} catch (e) {
  console.error(JSON.stringify({ action: 'error', reason: (e as Error).message }));
  process.exitCode = 1;
}
process.exit();

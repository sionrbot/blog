import { withDeadline } from './astro-process.ts';

const owners = new Set<() => Promise<void>>();
let interrupted = false;

async function interrupt(signal: 'SIGINT' | 'SIGTERM') {
  if (interrupted) return;
  interrupted = true;
  try {
    const results = await withDeadline(
      Promise.allSettled([...owners].map((dispose) => dispose())),
      30_000,
      'Interrupted fixture cleanup',
    );
    for (const result of results) {
      if (result.status === 'rejected') console.error(result.reason);
    }
  } catch (error) {
    console.error(error);
  } finally {
    process.exit(signal === 'SIGINT' ? 130 : 143);
  }
}
const onInt = () => {
  void interrupt('SIGINT');
};
const onTerm = () => {
  void interrupt('SIGTERM');
};

/** Own signals until every fixture has finished cleanup, including between CLI runs. */
export function ownFixture(dispose: () => Promise<void>) {
  if (interrupted) throw new Error('Fixture process is shutting down');
  if (owners.size === 0) {
    process.on('SIGINT', onInt);
    process.on('SIGTERM', onTerm);
  }
  owners.add(dispose);
  return () => {
    owners.delete(dispose);
    if (owners.size === 0 && !interrupted) {
      process.removeListener('SIGINT', onInt);
      process.removeListener('SIGTERM', onTerm);
    }
  };
}

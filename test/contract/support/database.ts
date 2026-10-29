// Write tests reset the target's database to the fixture dataset before and after they run, so the read tests
// (and reruns) always see test/fixtures/dataset.ts. The command is target-specific (RESET_DB_COMMAND).
import { legacyResetDbCommand, resetDbCommand } from './target';

export function resetDatabase(): Promise<void> {
  return run(resetDbCommand);
}

/** Cross-implementation tests also write to the legacy database. */
export function resetLegacyDatabase(): Promise<void> {
  return run(legacyResetDbCommand);
}

async function run(command: string): Promise<void> {
  const child = Bun.spawn(['sh', '-c', command], { stdout: 'pipe', stderr: 'pipe' });
  const exitCode = await child.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(child.stderr).text();
    throw new Error(`Database reset failed (${command}): ${stderr}`);
  }
}

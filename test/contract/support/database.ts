// Write tests reset the target's database to the fixture dataset before and after they run, so the read tests
// (and reruns) always see test/fixtures/dataset.ts. The command is target-specific (RESET_DB_COMMAND).
import { resetDbCommand } from './target';

export async function resetDatabase(): Promise<void> {
  const child = Bun.spawn(['sh', '-c', resetDbCommand], { stdout: 'pipe', stderr: 'pipe' });
  const exitCode = await child.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(child.stderr).text();
    throw new Error(`Database reset failed (${resetDbCommand}): ${stderr}`);
  }
}

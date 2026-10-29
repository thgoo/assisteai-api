// Tests that write reset the database to the dataset before and after they run, so the read tests (and reruns)
// always see test/fixtures/dataset.ts.
import { resetDbCommand } from './env';

export async function resetDatabase(): Promise<void> {
  const child = Bun.spawn(['sh', '-c', resetDbCommand], { stdout: 'pipe', stderr: 'pipe' });
  const exitCode = await child.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(child.stderr).text();
    throw new Error(`Database reset failed (${resetDbCommand}): ${stderr}`);
  }
}

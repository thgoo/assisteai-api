// Runs the API tests end to end: starts the mock and the app (with .env), waits until both answer, runs test/api,
// and stops everything. The database must be up and migrated (`bun run db:up && bun run db:migrate`).
//   bun run test:api:local [bun test args…]
const APP_URL = 'http://127.0.0.1:3000/health';
const MOCK_URL = 'http://127.0.0.1:8080/__requests';

async function answers(url: string): Promise<boolean> {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}

async function waitFor(url: string, name: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await answers(url)) return;
    await Bun.sleep(100);
  }
  throw new Error(`${name} didn't start (${url})`);
}

for (const [url, name] of [[APP_URL, 'The app'], [MOCK_URL, 'The mock']] as const) {
  if (await answers(url)) {
    console.error(`${name} is already running (${url}). Stop it, or run \`bun run test:api\` against it.`);
    process.exit(1);
  }
}

const mock = Bun.spawn(['bun', 'test/mock/server.ts'], { stdout: 'ignore', stderr: 'inherit' });
const app = Bun.spawn(['bun', 'src/index.ts'], { stdout: 'ignore', stderr: 'inherit' });
let exitCode = 1;
try {
  await Promise.all([waitFor(MOCK_URL, 'The mock'), waitFor(APP_URL, 'The app')]);
  const args = ['bun', 'test', 'test/api', ...process.argv.slice(2)];
  const tests = Bun.spawn(args, { stdout: 'inherit', stderr: 'inherit' });
  exitCode = await tests.exited;
} finally {
  app.kill();
  mock.kill();
}
process.exit(exitCode);

// Stand-in for the external APIs the app calls (TMDb, Telegram), for the API tests and local development.
// Each API answers under a prefix named after its host, e.g. http://127.0.0.1:8080/api.themoviedb.org/3/movie/603,
// so the app only needs its base URLs pointed here.
//
// Control API:
//   GET  /__requests   every request received since the last reset
//   POST /__reset      clears recorded requests and stubs
//   POST /__tmdb       {path, query?, status?, body} → response for a TMDb path, e.g. "/3/movie/603"
// Anything not stubbed answers like the real API would for an unknown resource.
//   bun test/mock/server.ts   (port: MOCK_PORT, default 8080)

interface Recorded {
  at: string;
  method: string;
  host: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: unknown;
}

interface TmdbStub {
  path: string;
  query: Record<string, string>;
  status: number;
  body: unknown;
}

const TMDB_NOT_FOUND = {
  success: false,
  status_code: 34,
  status_message: 'The resource you requested could not be found.',
};

let requests: Recorded[] = [];
let tmdbStubs: TmdbStub[] = [];
let telegramMessageId = 0;

const json = (body: unknown, status = 200) => Response.json(body, { status });

async function readBody(req: Request): Promise<unknown> {
  if (req.method === 'GET' || req.method === 'HEAD') return null;
  const type = req.headers.get('content-type') ?? '';
  if (type.includes('application/json')) return req.json();
  if (type.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(await req.text()));
  }
  if (type.includes('multipart/form-data')) {
    // Only local, trusted test traffic reaches this mock, so the built-in parser is fine here.
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    return Object.fromEntries((await req.formData()).entries());
  }
  return req.text();
}

async function record(req: Request): Promise<Recorded> {
  const url = new URL(req.url);
  const entry: Recorded = {
    at: new Date().toISOString(),
    method: req.method,
    host: (req.headers.get('host') ?? '').replace(/:\d+$/, ''),
    path: url.pathname,
    query: Object.fromEntries(url.searchParams),
    headers: Object.fromEntries(req.headers),
    body: await readBody(req),
  };
  requests.push(entry);
  return entry;
}

function tmdb(r: Recorded): Response {
  const matches = (stub: TmdbStub) =>
    stub.path === r.path && Object.entries(stub.query).every(([key, value]) => r.query[key] === value);
  const stub = tmdbStubs.findLast(matches);
  return stub ? json(stub.body, stub.status) : json(TMDB_NOT_FOUND, 404);
}

function telegram(r: Recorded): Response {
  if (!/^\/bot[^/]+\/sendMessage$/.test(r.path)) {
    return json({ ok: false, error_code: 404, description: 'Not Found' }, 404);
  }
  telegramMessageId += 1;
  return json({ ok: true, result: { message_id: telegramMessageId } });
}

const externalHandlers: Record<string, (r: Recorded) => Response> = {
  'api.themoviedb.org': tmdb,
  'api.telegram.org': telegram,
};

async function external(req: Request): Promise<Response> {
  const r = await record(req);
  const handler = externalHandlers[r.host];
  return handler ? handler(r) : json({ error: `unexpected host ${r.host}` }, 502);
}

/** `/<host>/<path>`, recorded as if `<host>` had been called directly. */
function prefixed(req: Request): Request | undefined {
  const url = new URL(req.url);
  const [, host, ...rest] = url.pathname.split('/');
  if (host === undefined || !(host in externalHandlers)) return undefined;

  const headers = new Headers(req.headers);
  headers.set('host', host);
  return new Request(`http://${host}/${rest.join('/')}${url.search}`, { method: req.method, headers, body: req.body });
}

async function control(req: Request): Promise<Response> {
  const forwarded = prefixed(req);
  if (forwarded) return external(forwarded);

  const { pathname } = new URL(req.url);
  const route = `${req.method} ${pathname}`;

  switch (route) {
    case 'GET /__requests':
      return json(requests);
    case 'POST /__reset':
      requests = [];
      tmdbStubs = [];
      return json({ ok: true });
    case 'POST /__tmdb': {
      const { path, query = {}, status = 200, body } = (await req.json()) as Partial<TmdbStub> & { path: string };
      tmdbStubs.push({ path, query, status, body });
      return json({ ok: true });
    }
    default:
      return json({ error: 'not_found' }, 404);
  }
}

const port = Number(process.env['MOCK_PORT'] ?? 8080);
Bun.serve({ port, fetch: control });
console.log(`mock listening on :${port}`);

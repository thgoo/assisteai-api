// Mock for the external APIs the legacy app calls. Docker network aliases point api.themoviedb.org,
// api.telegram.org and www.googleapis.com here; HTTPS uses the throwaway CA from certs.sh.
//
// Control API (port 8080, published on the host):
//   GET  /__requests        every request received since the last reset
//   POST /__reset           clears recorded requests and runtime stubs
//   POST /__google/tokens   {token, user: {sub, name, email, picture}} → userinfo for that access token
//   POST /__tmdb            {path, query?, status?, body} → response for a TMDb path, e.g. "/3/movie/603"
// Anything not stubbed answers like the real API would for an unknown resource or token.

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
let googleTokens = new Map<string, unknown>();
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

function google(r: Recorded): Response {
  if (r.path !== '/oauth2/v3/userinfo') return json({ error: 'not_found' }, 404);
  const token = (r.headers['authorization'] ?? '').replace(/^Bearer /, '');
  const user = googleTokens.get(token);
  if (!user) return json({ error: 'invalid_request', error_description: 'Invalid Credentials' }, 401);
  return json(user);
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
  'www.googleapis.com': google,
  'api.themoviedb.org': tmdb,
  'api.telegram.org': telegram,
};

async function external(req: Request): Promise<Response> {
  const r = await record(req);
  const handler = externalHandlers[r.host];
  return handler ? handler(r) : json({ error: `unexpected host ${r.host}` }, 502);
}

async function control(req: Request): Promise<Response> {
  const { pathname } = new URL(req.url);
  const route = `${req.method} ${pathname}`;

  switch (route) {
    case 'GET /__requests':
      return json(requests);
    case 'POST /__reset':
      requests = [];
      googleTokens = new Map();
      tmdbStubs = [];
      return json({ ok: true });
    case 'POST /__google/tokens': {
      const { token, user } = (await req.json()) as { token: string; user: unknown };
      googleTokens.set(token, user);
      return json({ ok: true });
    }
    case 'POST /__tmdb': {
      const { path, query = {}, status = 200, body } = (await req.json()) as Partial<TmdbStub> & { path: string };
      tmdbStubs.push({ path, query, status, body });
      return json({ ok: true });
    }
    default:
      return json({ error: 'not_found' }, 404);
  }
}

Bun.serve({ port: 80, fetch: external });
Bun.serve({ port: 443, fetch: external, tls: { cert: Bun.file('/certs/mock.pem'), key: Bun.file('/certs/mock.key') } });
Bun.serve({ port: 8080, fetch: control });
console.log('mock listening on :80, :443 (TLS) and :8080 (control)');

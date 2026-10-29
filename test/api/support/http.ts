import { baseUrl } from './env';

export interface ApiResponse {
  status: number;
  headers: Headers;
  body: unknown;
}

interface RequestOptions {
  /** The session cookie's value. */
  session?: string;
  json?: unknown;
  headers?: Record<string, string>;
}

export async function request(method: string, path: string, options: RequestOptions = {}): Promise<ApiResponse> {
  const headers = new Headers({ Accept: 'application/json', ...options.headers });
  if (options.session !== undefined) headers.set('Cookie', `session=${options.session}`);
  if (options.json !== undefined) headers.set('Content-Type', 'application/json');

  const response = await fetch(new URL(path, baseUrl), {
    method,
    headers,
    body: options.json === undefined ? undefined : JSON.stringify(options.json),
  });
  const text = await response.text();
  return { status: response.status, headers: response.headers, body: parseJson(text) };
}

export function get(path: string, options: Omit<RequestOptions, 'json'> = {}): Promise<ApiResponse> {
  return request('GET', path, options);
}

export function post(path: string, options: RequestOptions = {}): Promise<ApiResponse> {
  return request('POST', path, options);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** The `session` cookie a response sets: its value and attributes. */
export function sessionCookie(response: ApiResponse): { value: string; attributes: string } | undefined {
  const cookie = response.headers.getSetCookie().find(header => header.startsWith('session='));
  if (cookie === undefined) return undefined;
  const [pair = '', ...attributes] = cookie.split(';').map(part => part.trim());
  return { value: pair.slice('session='.length), attributes: attributes.join('; ') };
}

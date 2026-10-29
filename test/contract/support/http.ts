import { baseUrl } from './target';

export interface ApiResponse {
  status: number;
  headers: Headers;
  body: unknown;
}

interface RequestOptions {
  token?: string;
  json?: unknown;
  headers?: Record<string, string>;
}

export async function request(method: string, path: string, options: RequestOptions = {}): Promise<ApiResponse> {
  const headers = new Headers({ Accept: 'application/json', ...options.headers });
  if (options.token !== undefined) headers.set('Authorization', `Bearer ${options.token}`);
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

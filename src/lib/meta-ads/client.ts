import 'server-only';

const GRAPH_ORIGIN = 'https://graph.facebook.com';
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;
const MAX_PAGES = 500;

export type MetaApiErrorShape = {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
};

export class MetaApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: MetaApiErrorShape,
    public readonly code = 'META_API_ERROR',
  ) {
    super(message);
    this.name = 'MetaApiError';
  }
}

function requiredEnv(name: 'META_GRAPH_API_VERSION' | 'META_SYSTEM_USER_ACCESS_TOKEN'): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function makeUrl(pathOrUrl: string, params?: Record<string, string>): URL {
  const version = requiredEnv('META_GRAPH_API_VERSION');
  if (!/^v\d+\.\d+$/.test(version)) throw new Error('META_GRAPH_API_VERSION has an invalid format');

  const url = pathOrUrl.startsWith('https://')
    ? new URL(pathOrUrl)
    : new URL(`${GRAPH_ORIGIN}/${version}/${pathOrUrl.replace(/^\//, '')}`);
  if (url.origin !== GRAPH_ORIGIN) throw new Error('Meta paging URL has an unexpected origin');

  for (const [key, value] of Object.entries(params ?? {})) url.searchParams.set(key, value);
  url.searchParams.set('access_token', requiredEnv('META_SYSTEM_USER_ACCESS_TOKEN'));
  return url;
}

function retryDelay(attempt: number): number {
  return 500 * 2 ** attempt + Math.floor(Math.random() * 250);
}

async function request<T>(pathOrUrl: string, params?: Record<string, string>, attempt = 0): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(makeUrl(pathOrUrl, params), { signal: controller.signal, cache: 'no-store' });
    const body = await response.json().catch(() => ({})) as { error?: MetaApiErrorShape };
    if (!response.ok || body.error) {
      const error = body.error;
      const retryable = response.status === 429 || response.status >= 500
        || [1, 2, 4, 17, 32, 613].includes(error?.code ?? -1);
      if (retryable && attempt < MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay(attempt)));
        return request<T>(pathOrUrl, params, attempt + 1);
      }
      throw new MetaApiError(error?.message || `Meta API returned HTTP ${response.status}`, response.status, error);
    }
    return body as T;
  } catch (error) {
    if (error instanceof MetaApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new MetaApiError('Meta API request timed out', 504, undefined, 'META_TIMEOUT');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchAllPages<T>(path: string, params: Record<string, string>): Promise<T[]> {
  const rows: T[] = [];
  let next: string | undefined;
  let pages = 0;
  do {
    if (++pages > MAX_PAGES) throw new MetaApiError('Meta pagination exceeded the safety limit', 502, undefined, 'META_PAGE_LIMIT');
    const response: { data?: T[]; paging?: { next?: string } } = next
      ? await request(next)
      : await request(path, { ...params, limit: params.limit || '500' });
    rows.push(...(response.data ?? []));
    next = response.paging?.next;
  } while (next);
  return rows;
}

export async function fetchMetaObject<T>(path: string, params: Record<string, string>): Promise<T> {
  return request<T>(path, params);
}

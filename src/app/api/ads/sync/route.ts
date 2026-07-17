import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getUserContext } from '@/lib/tenant';
import { syncAllActiveAccounts, syncMetaAdAccount, MetaAccountDiscoveryError } from '@/lib/meta-ads/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MAX_BODY_BYTES = 4_096;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function authorizedCron(request: NextRequest): boolean {
  const secret = process.env.META_SYNC_CRON_SECRET;
  const header = request.headers.get('authorization');
  if (!secret || !header?.startsWith('Bearer ')) return false;
  const supplied = header.slice(7);
  const expectedBuffer = Buffer.from(secret);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
}

function hasValidDateRange(from: unknown, to: unknown): from is string {
  return typeof from === 'string' && typeof to === 'string'
    && DATE_RE.test(from) && DATE_RE.test(to) && from <= to;
}

function responseStatus(results: { status: string }[]): number {
  return results.some((row) => row.status === 'failed' || row.status === 'partial') ? 207 : 200;
}

function syncError(error: unknown) {
  const code = error instanceof MetaAccountDiscoveryError ? error.code : 'SYNC_UNAVAILABLE';
  const status = code === 'AUTO_DISCOVERY_REQUIRES_SINGLE_TENANT' ? 409 : 502;
  return NextResponse.json({ error: { code } }, { status });
}

async function runFullSync(days: number) {
  try {
    const results = await syncAllActiveAccounts(days);
    return NextResponse.json({ discoveredAccounts: results.length, results }, { status: responseStatus(results) });
  } catch (error) {
    return syncError(error);
  }
}

export async function GET(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 });
  return runFullSync(7);
}

export async function POST(request: NextRequest) {
  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 });
  if (ctx.role !== 'super_admin') return NextResponse.json({ error: { code: 'FORBIDDEN' } }, { status: 403 });

  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > MAX_BODY_BYTES) return NextResponse.json({ error: { code: 'BODY_TOO_LARGE' } }, { status: 413 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: { code: 'INVALID_JSON' } }, { status: 400 });

  if (body.accountId !== undefined || body.dateFrom !== undefined || body.dateTo !== undefined) {
    const accountId = String(body.accountId ?? '').replace(/^act_/, '');
    if (!/^\d+$/.test(accountId) || !hasValidDateRange(body.dateFrom, body.dateTo)) {
      return NextResponse.json({ error: { code: 'INVALID_SYNC_FILTERS' } }, { status: 400 });
    }
    const result = await syncMetaAdAccount(accountId, body.dateFrom, String(body.dateTo));
    return NextResponse.json(result, { status: result.status === 'success' ? 200 : result.status === 'partial' ? 207 : 502 });
  }

  const parsedDays = Number(body.days ?? 7);
  const days = Number.isFinite(parsedDays) ? Math.min(Math.max(Math.trunc(parsedDays), 1), 90) : 7;
  return runFullSync(days);
}

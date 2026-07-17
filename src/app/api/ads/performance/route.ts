import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getUserContext } from '@/lib/tenant';
import { getAdsReport, getAllowedAdAccounts, type AdsReportLevel } from '@/lib/meta-ads/queries';

export const dynamic = 'force-dynamic';

const LEVELS = new Set<AdsReportLevel>(['campaign', 'adset', 'ad']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 366;
const MAX_SEARCH_LENGTH = 100;

function isRealDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function rangeDays(from: string, to: string): number {
  return Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

function apiError(code: string, status: number, requestId: string) {
  return NextResponse.json({ error: { code, requestId } }, { status, headers: { 'x-request-id': requestId } });
}

export async function GET(request: NextRequest) {
  const requestId = randomUUID();
  try {
    const ctx = await getUserContext();
    if (!ctx) return apiError('UNAUTHORIZED', 401, requestId);

    const params = request.nextUrl.searchParams;
    const today = new Date();
    const fallbackFrom = new Date(today);
    fallbackFrom.setUTCDate(today.getUTCDate() - 29);
    const dateFrom = params.get('date_from') || fallbackFrom.toISOString().slice(0, 10);
    const dateTo = params.get('date_to') || today.toISOString().slice(0, 10);
    const level = (params.get('level') || 'campaign') as AdsReportLevel;
    const search = params.get('search')?.trim() || '';

    if (!isRealDate(dateFrom) || !isRealDate(dateTo) || dateFrom > dateTo
      || rangeDays(dateFrom, dateTo) > MAX_RANGE_DAYS || !LEVELS.has(level)
      || search.length > MAX_SEARCH_LENGTH) {
      return apiError('INVALID_FILTERS', 400, requestId);
    }

    const allowedAccounts = await getAllowedAdAccounts(ctx);
    const requestedAccount = params.get('account_id');
    const accounts = requestedAccount
      ? allowedAccounts.filter((account) => account.ad_account_id === requestedAccount)
      : allowedAccounts;
    if (requestedAccount && accounts.length === 0) return apiError('FORBIDDEN_ACCOUNT', 403, requestId);

    const limitValue = Number(params.get('limit') ?? 100);
    const offsetValue = Number(params.get('offset') ?? 0);
    const limit = Number.isFinite(limitValue) ? Math.min(Math.max(Math.trunc(limitValue), 1), 200) : 100;
    const offset = Number.isFinite(offsetValue) ? Math.min(Math.max(Math.trunc(offsetValue), 0), 100_000) : 0;
    const currencies = [...new Set(accounts.map((account) => account.currency))];
    const mixedCurrency = currencies.length > 1;
    const report = await getAdsReport(
      accounts.map((account) => account.ad_account_id), dateFrom, dateTo, level, search, limit, offset,
    );

    return NextResponse.json({
      ...report,
      currency: currencies.length === 1 ? currencies[0] : null,
      mixedCurrency,
      moneyAggregationAllowed: !mixedCurrency,
      accounts,
      resultLabel: accounts.length === 1 ? accounts[0].primary_result_label : null,
      filters: { dateFrom, dateTo, level, accountId: requestedAccount },
      requestId,
    }, { headers: { 'x-request-id': requestId } });
  } catch {
    return apiError('REPORT_UNAVAILABLE', 500, requestId);
  }
}

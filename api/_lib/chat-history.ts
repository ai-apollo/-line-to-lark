// Private helpers for reading LINE chat history from the Lark messages table.
// Lives under `api/_lib/` so Vercel does not expose it as a serverless function.

const LARK_BASE_URL = 'https://open.larksuite.com/open-apis';

// Canonical column written by api/lark/message-log.ts.
export const CANONICAL_USER_ID_FIELD = 'user_id';
// Legacy column name. Only used when explicitly configured; never guessed.
export const LEGACY_USER_ID_FIELD = 'line_user_id';
const ALLOWED_USER_ID_FIELDS = [CANONICAL_USER_ID_FIELD, LEGACY_USER_ID_FIELD] as const;
export type UserIdField = (typeof ALLOWED_USER_ID_FIELDS)[number];

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 500; // Lark bitable search page_size upper bound
const MAX_PAGES = 20;
export const MAX_ALL_RECORDS = 5000; // upper bound for an all-pages read

// LINE Messaging API user IDs: "U" followed by 32 lowercase hex chars.
const LINE_USER_ID_RE = /^U[0-9a-f]{32}$/;

export type HistoryErrorKind =
  | 'config'
  | 'invalid_input'
  | 'upstream_auth'
  | 'rate_limited'
  | 'upstream_unavailable'
  | 'upstream_error'
  | 'malformed_response';

// Error messages are fixed strings; they never include tokens, request bodies,
// upstream response bodies or user identifiers.
export class HistoryError extends Error {
  readonly kind: HistoryErrorKind;
  readonly upstreamStatus?: number;
  readonly larkCode?: number;

  constructor(
    kind: HistoryErrorKind,
    message: string,
    details: { upstreamStatus?: number; larkCode?: number } = {},
  ) {
    super(message);
    this.name = 'HistoryError';
    this.kind = kind;
    this.upstreamStatus = details.upstreamStatus;
    this.larkCode = details.larkCode;
  }
}

export type HistoryConfig = {
  appId: string;
  appSecret: string;
  appToken: string;
  tableId: string;
  userIdField: UserIdField;
};

type Env = Record<string, string | undefined>;

export function loadHistoryConfig(env: Env = process.env): HistoryConfig {
  const appId = env.LARK_APP_ID;
  const appSecret = env.LARK_APP_SECRET;
  const appToken = env.LARK_APP_TOKEN;
  const tableId = env.LARK_MESSAGES_TABLE_ID;
  if (!appId || !appSecret || !appToken || !tableId) {
    throw new HistoryError('config', 'Lark configuration is incomplete');
  }

  const rawField = env.LARK_MESSAGES_USER_ID_FIELD;
  let userIdField: UserIdField = CANONICAL_USER_ID_FIELD;
  if (rawField !== undefined && rawField !== '') {
    if (!(ALLOWED_USER_ID_FIELDS as readonly string[]).includes(rawField)) {
      throw new HistoryError('config', 'LARK_MESSAGES_USER_ID_FIELD is not an allowed field name');
    }
    userIdField = rawField as UserIdField;
  }

  return { appId, appSecret, appToken, tableId, userIdField };
}

export function parseUserId(raw: unknown): string {
  if (typeof raw !== 'string' || !LINE_USER_ID_RE.test(raw)) {
    throw new HistoryError('invalid_input', 'userId must be a LINE user ID');
  }
  return raw;
}

export function parseLimit(raw: unknown): number {
  if (raw === undefined) return DEFAULT_LIMIT;
  if (typeof raw !== 'string' || !/^[0-9]{1,4}$/.test(raw)) {
    throw new HistoryError('invalid_input', `limit must be an integer between 1 and ${MAX_LIMIT}`);
  }
  const n = Number(raw);
  if (n < 1 || n > MAX_LIMIT) {
    throw new HistoryError('invalid_input', `limit must be an integer between 1 and ${MAX_LIMIT}`);
  }
  return n;
}

type FetchLike = typeof fetch;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function errorForStatus(status: number, what: string): HistoryError {
  if (status === 401 || status === 403) {
    return new HistoryError('upstream_auth', `${what} was not authorized`, { upstreamStatus: status });
  }
  if (status === 429) {
    return new HistoryError('rate_limited', `${what} was rate limited`, { upstreamStatus: status });
  }
  if (status >= 500) {
    return new HistoryError('upstream_unavailable', `${what} is unavailable`, { upstreamStatus: status });
  }
  return new HistoryError('upstream_error', `${what} failed`, { upstreamStatus: status });
}

async function readLarkJson(resp: Response, what: string): Promise<Record<string, unknown>> {
  if (!resp.ok) throw errorForStatus(resp.status, what);

  let body: unknown;
  try {
    body = await resp.json();
  } catch {
    throw new HistoryError('malformed_response', `${what} returned non-JSON`, { upstreamStatus: resp.status });
  }
  if (!isObject(body) || typeof body.code !== 'number') {
    throw new HistoryError('malformed_response', `${what} returned an unexpected shape`);
  }
  if (body.code !== 0) {
    throw new HistoryError('upstream_error', `${what} returned an error code`, { larkCode: body.code });
  }
  return body;
}

export async function fetchTenantToken(config: HistoryConfig, fetchImpl: FetchLike = fetch): Promise<string> {
  const resp = await fetchImpl(`${LARK_BASE_URL}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: config.appId, app_secret: config.appSecret }),
  });
  const body = await readLarkJson(resp, 'Lark token request');
  const token = body.tenant_access_token;
  if (typeof token !== 'string' || token.length === 0) {
    throw new HistoryError('malformed_response', 'Lark token response is missing tenant_access_token');
  }
  return token;
}

export type HistoryRecord = {
  record_id: string;
  fields: Record<string, unknown>;
};

// Lark returns text columns either as a plain string or as rich-text segments.
function textValue(v: unknown): string | undefined {
  if (typeof v === 'string') return v;
  if (Array.isArray(v) && v.every((s) => isObject(s) && typeof s.text === 'string')) {
    return v.map((s) => (s as { text: string }).text).join('');
  }
  return undefined;
}

type SearchPage = { items: HistoryRecord[]; hasMore: boolean; pageToken?: string };

function parseSearchPage(body: Record<string, unknown>): SearchPage {
  const data = body.data;
  if (!isObject(data) || typeof data.has_more !== 'boolean') {
    throw new HistoryError('malformed_response', 'Lark search response is missing data');
  }

  let rawItems = data.items;
  if (rawItems === undefined || rawItems === null) {
    // Lark may omit `items` for an empty result; accept that only when it says so explicitly.
    if (data.total === 0 && data.has_more === false) {
      rawItems = [];
    } else {
      throw new HistoryError('malformed_response', 'Lark search response is missing items');
    }
  }
  if (!Array.isArray(rawItems)) {
    throw new HistoryError('malformed_response', 'Lark search items is not an array');
  }

  const items = rawItems.map((item) => {
    if (!isObject(item) || typeof item.record_id !== 'string' || !isObject(item.fields)) {
      throw new HistoryError('malformed_response', 'Lark search item has an unexpected shape');
    }
    return { record_id: item.record_id, fields: item.fields };
  });

  let pageToken: string | undefined;
  if (data.has_more) {
    if (typeof data.page_token !== 'string' || data.page_token.length === 0) {
      throw new HistoryError('malformed_response', 'Lark search has_more without page_token');
    }
    pageToken = data.page_token;
  }
  return { items, hasMore: data.has_more, pageToken };
}

export type ReadOptions =
  | { mode: 'limit'; limit: number }
  | { mode: 'all' };

// Why a read stopped. Only 'exhausted' means the full history was read.
export type StopReason = 'exhausted' | 'limit_reached' | 'record_cap_reached' | 'page_cap_reached';

export type HistoryResult = {
  records: HistoryRecord[];
  complete: boolean;
  stopReason: StopReason;
  pagesRead: number;
};

// Earliest plausible message timestamp (LINE launch, 2011-06-01 UTC) in ms.
const MIN_TS_MS = Date.UTC(2011, 5, 1);
const MAX_CLOCK_SKEW_MS = 24 * 60 * 60 * 1000;

export function parseTimestampMs(v: unknown, now: number): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < MIN_TS_MS || v > now + MAX_CLOCK_SKEW_MS) {
    throw new HistoryError('malformed_response', 'Lark search record has an invalid ts');
  }
  return v;
}

function validateReadOptions(options: ReadOptions): void {
  if (options.mode === 'all') return;
  if (options.mode !== 'limit' || !Number.isInteger(options.limit) || options.limit < 1 || options.limit > MAX_LIMIT) {
    throw new HistoryError('invalid_input', `limit must be an integer between 1 and ${MAX_LIMIT}`);
  }
}

// Reads one user's history in chronological order. Any failure on any page rejects
// the whole read: partial pages are never returned as if they were the full history.
// A successful result is complete only when Lark reported no further pages.
export async function readChatHistory(
  config: HistoryConfig,
  userId: string,
  options: ReadOptions,
  fetchImpl: FetchLike = fetch,
  now: () => number = Date.now,
): Promise<HistoryResult> {
  parseUserId(userId);
  validateReadOptions(options);
  const target = options.mode === 'limit' ? options.limit : MAX_ALL_RECORDS;

  const token = await fetchTenantToken(config, fetchImpl);
  const url =
    `${LARK_BASE_URL}/bitable/v1/apps/${encodeURIComponent(config.appToken)}` +
    `/tables/${encodeURIComponent(config.tableId)}/records/search`;

  const records: HistoryRecord[] = [];
  const timestamps: number[] = [];
  const seenRecordIds = new Set<string>();
  const seenTokens = new Set<string>();
  const nowMs = now();
  let pageToken: string | undefined;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const pageSize = Math.min(MAX_LIMIT, target - records.length);
    const query = new URLSearchParams({ page_size: String(pageSize) });
    if (pageToken) query.set('page_token', pageToken);

    const resp = await fetchImpl(`${url}?${query.toString()}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filter: {
          conjunction: 'and',
          conditions: [
            { field_name: config.userIdField, operator: 'is', value: [userId] },
          ],
        },
        sort: [{ field_name: 'ts', desc: false }], // 古い順（時系列）
      }),
    });
    const parsed = parseSearchPage(await readLarkJson(resp, 'Lark search request'));

    if (parsed.items.length > pageSize) {
      throw new HistoryError('malformed_response', 'Lark search returned more records than requested');
    }
    if (parsed.hasMore && parsed.items.length === 0) {
      throw new HistoryError('malformed_response', 'Lark search returned an empty page with has_more');
    }
    for (const item of parsed.items) {
      // Defense in depth: never return a record that belongs to another user.
      if (textValue(item.fields[config.userIdField]) !== userId) {
        throw new HistoryError('malformed_response', 'Lark search returned a record for a different user');
      }
      if (seenRecordIds.has(item.record_id)) {
        throw new HistoryError('malformed_response', 'Lark search returned a duplicate record');
      }
      const ts = parseTimestampMs(item.fields.ts, nowMs);
      if (timestamps.length > 0 && ts < timestamps[timestamps.length - 1]) {
        throw new HistoryError('malformed_response', 'Lark search returned records out of chronological order');
      }
      seenRecordIds.add(item.record_id);
      timestamps.push(ts);
      records.push(item);
    }

    if (!parsed.hasMore) {
      return finish(records, timestamps, 'exhausted', page);
    }
    if (records.length >= target) {
      return finish(records, timestamps, options.mode === 'limit' ? 'limit_reached' : 'record_cap_reached', page);
    }
    if (seenTokens.has(parsed.pageToken!)) {
      throw new HistoryError('malformed_response', 'Lark search repeated a page_token');
    }
    seenTokens.add(parsed.pageToken!);
    pageToken = parsed.pageToken;
  }

  return finish(records, timestamps, 'page_cap_reached', MAX_PAGES);
}

function finish(records: HistoryRecord[], timestamps: number[], stopReason: StopReason, pagesRead: number): HistoryResult {
  // Ties on ts are ordered by record_id so output is stable across runs.
  const ordered = records
    .map((record, i) => ({ record, ts: timestamps[i] }))
    .sort((a, b) => a.ts - b.ts || (a.record.record_id < b.record.record_id ? -1 : a.record.record_id > b.record.record_id ? 1 : 0))
    .map((x) => x.record);
  return { records: ordered, complete: stopReason === 'exhausted', stopReason, pagesRead };
}

export function formatHistoryRecord(record: HistoryRecord) {
  const fields = record.fields;
  return {
    record_id: record.record_id,
    timestamp: fields.ts,
    direction: fields.direction, // 'incoming' or 'outgoing'
    event_type: fields.event_type,
    message_type: fields.message_type,
    text: fields.text || '',
    payload: fields.payload || '',
    message_id: fields.message_id || '',
  };
}

// Maps a helper error to a client-safe HTTP response. Upstream details stay server side.
export function toHttpError(err: unknown): { status: number; body: { error: string } } {
  if (err instanceof HistoryError) {
    switch (err.kind) {
      case 'invalid_input':
        return { status: 400, body: { error: err.message } };
      case 'rate_limited':
        return { status: 503, body: { error: 'Chat history is temporarily unavailable' } };
      case 'config':
        return { status: 500, body: { error: 'Chat history is not configured' } };
      default:
        return { status: 502, body: { error: 'Failed to get chat history' } };
    }
  }
  return { status: 500, body: { error: 'Failed to get chat history' } };
}

// Log line without tokens, bodies or user identifiers. Only fixed categories and
// numeric provider codes; unexpected errors never contribute their name or message.
export function describeError(err: unknown): Record<string, unknown> {
  if (err instanceof HistoryError) {
    return { kind: err.kind, upstreamStatus: err.upstreamStatus, larkCode: err.larkCode };
  }
  return { kind: 'unexpected' };
}

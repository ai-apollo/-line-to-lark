import { describe, expect, it, vi } from 'vitest';
import {
  HistoryConfig,
  HistoryError,
  MAX_ALL_RECORDS,
  MAX_LIMIT,
  describeError,
  loadHistoryConfig,
  parseLimit,
  parseTimestampMs,
  parseUserId,
  readChatHistory,
  toHttpError,
} from '../../../api/_lib/chat-history';

// Synthetic fixtures only. None of these identifiers exist in LINE or Lark.
const USER_A = 'U' + 'a'.repeat(32);
const USER_B = 'U' + 'b'.repeat(32);
const FAKE_TOKEN = 't-synthetic-token';

const ENV = {
  LARK_APP_ID: 'cli_synthetic',
  LARK_APP_SECRET: 'synthetic-secret',
  LARK_APP_TOKEN: 'appSynthetic',
  LARK_MESSAGES_TABLE_ID: 'tblSynthetic',
};
const CONFIG: HistoryConfig = loadHistoryConfig(ENV);
const NOW = () => Date.UTC(2026, 0, 1);
const lim = (limit: number) => ({ mode: 'limit', limit }) as const;
const EMPTY = { records: [], complete: true, stopReason: 'exhausted', pagesRead: 1 };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const tokenOk = () => json({ code: 0, msg: 'ok', tenant_access_token: FAKE_TOKEN, expire: 7200 });

function record(id: string, userId = USER_A, field = 'user_id', ts = 1700000000000) {
  return {
    record_id: id,
    fields: { [field]: userId, ts, direction: 'incoming', event_type: 'message', message_type: 'text', text: `synthetic ${id}` },
  };
}

function page(items: unknown[], hasMore = false, pageToken?: string) {
  return json({ code: 0, msg: 'success', data: { items, has_more: hasMore, page_token: pageToken, total: items.length } });
}

function mockFetch(...responses: Array<Response | (() => Response)>) {
  const fn = vi.fn<typeof fetch>();
  for (const r of responses) {
    fn.mockImplementationOnce(async () => (typeof r === 'function' ? r() : r));
  }
  fn.mockImplementation(async () => {
    throw new Error('unexpected extra fetch');
  });
  return fn;
}

function searchBody(fn: ReturnType<typeof mockFetch>, call: number) {
  return JSON.parse(String(fn.mock.calls[call][1]!.body));
}

async function expectKind(p: Promise<unknown>, kind: string) {
  await expect(p).rejects.toBeInstanceOf(HistoryError);
  await p.catch((e: HistoryError) => expect(e.kind).toBe(kind));
}

describe('loadHistoryConfig', () => {
  it('defaults to the canonical user_id field', () => {
    expect(loadHistoryConfig(ENV).userIdField).toBe('user_id');
    expect(loadHistoryConfig({ ...ENV, LARK_MESSAGES_USER_ID_FIELD: '' }).userIdField).toBe('user_id');
  });

  it('uses the legacy field only when explicitly configured', () => {
    expect(loadHistoryConfig({ ...ENV, LARK_MESSAGES_USER_ID_FIELD: 'line_user_id' }).userIdField).toBe('line_user_id');
  });

  it('rejects unknown field names', () => {
    expect(() => loadHistoryConfig({ ...ENV, LARK_MESSAGES_USER_ID_FIELD: 'text' })).toThrow(HistoryError);
  });

  it('rejects missing credentials', () => {
    for (const key of Object.keys(ENV)) {
      const env: Record<string, string | undefined> = { ...ENV, [key]: undefined };
      expect(() => loadHistoryConfig(env)).toThrow(/incomplete/);
    }
  });
});

describe('input validation', () => {
  it('accepts a LINE user ID and rejects anything else', () => {
    expect(parseUserId(USER_A)).toBe(USER_A);
    for (const bad of [undefined, '', 'abc', USER_A + 'x', USER_A.toUpperCase(), [USER_A], `${USER_A}","x`]) {
      expect(() => parseUserId(bad)).toThrow(HistoryError);
    }
  });

  it('parses bounded integer limits', () => {
    expect(parseLimit(undefined)).toBe(50);
    expect(parseLimit('1')).toBe(1);
    expect(parseLimit(String(MAX_LIMIT))).toBe(MAX_LIMIT);
  });

  it.each(['0', '-1', '1.5', '10abc', '', ' 5', '501', '99999', '1e2', 'NaN'])('rejects limit %j', (raw) => {
    expect(() => parseLimit(raw)).toThrow(HistoryError);
  });

  it('rejects non-string limits (e.g. repeated query params)', () => {
    expect(() => parseLimit(['10', '20'])).toThrow(HistoryError);
  });

  it('readChatHistory validates before any upstream call', async () => {
    const fn = mockFetch();
    await expectKind(readChatHistory(CONFIG, 'not-a-user', lim(10), fn, NOW), 'invalid_input');
    await expectKind(readChatHistory(CONFIG, USER_A, lim(0), fn, NOW), 'invalid_input');
    await expectKind(readChatHistory(CONFIG, USER_A, lim(1.5), fn, NOW), 'invalid_input');
    await expectKind(readChatHistory(CONFIG, USER_A, lim(MAX_LIMIT + 1), fn, NOW), 'invalid_input');
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('readChatHistory field selection', () => {
  it('filters on canonical user_id', async () => {
    const fn = mockFetch(tokenOk(), page([record('rec1')]));
    const result = await readChatHistory(CONFIG, USER_A, lim(10), fn, NOW);
    expect(result.records.map((r) => r.record_id)).toEqual(['rec1']);
    const body = searchBody(fn, 1);
    expect(body.filter.conditions).toEqual([{ field_name: 'user_id', operator: 'is', value: [USER_A] }]);
    expect(fn.mock.calls[1][1]!.headers).toMatchObject({ Authorization: `Bearer ${FAKE_TOKEN}` });
  });

  it('filters on line_user_id only when configured', async () => {
    const legacy = loadHistoryConfig({ ...ENV, LARK_MESSAGES_USER_ID_FIELD: 'line_user_id' });
    const fn = mockFetch(tokenOk(), page([record('rec1', USER_A, 'line_user_id')]));
    await readChatHistory(legacy, USER_A, lim(10), fn, NOW);
    expect(searchBody(fn, 1).filter.conditions[0].field_name).toBe('line_user_id');
  });

  it('does not silently fall back to the legacy field on empty canonical results', async () => {
    const fn = mockFetch(tokenOk(), page([]));
    const result = await readChatHistory(CONFIG, USER_A, lim(10), fn, NOW);
    expect(result).toEqual(EMPTY);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('accepts rich-text segments for the user field', async () => {
    const rec = record('rec1');
    rec.fields.user_id = [{ type: 'text', text: USER_A }] as unknown as string;
    const fn = mockFetch(tokenOk(), page([rec]));
    await expect(readChatHistory(CONFIG, USER_A, lim(10), fn, NOW)).resolves.toMatchObject({ records: [{ record_id: 'rec1' }] });
  });

  it('fails closed if a record belongs to another user', async () => {
    const fn = mockFetch(tokenOk(), page([record('rec1'), record('rec2', USER_B)]));
    await expectKind(readChatHistory(CONFIG, USER_A, lim(10), fn, NOW), 'malformed_response');
  });
});

describe('empty history versus provider failure', () => {
  it('returns empty history for an explicit empty result', async () => {
    const fn = mockFetch(tokenOk(), page([]));
    await expect(readChatHistory(CONFIG, USER_A, lim(10), fn, NOW)).resolves.toEqual(EMPTY);
  });

  it('returns empty history when Lark omits items but reports total 0', async () => {
    const fn = mockFetch(tokenOk(), json({ code: 0, data: { has_more: false, total: 0 } }));
    await expect(readChatHistory(CONFIG, USER_A, lim(10), fn, NOW)).resolves.toEqual(EMPTY);
  });

  it.each([
    [401, 'upstream_auth'],
    [403, 'upstream_auth'],
    [429, 'rate_limited'],
    [500, 'upstream_unavailable'],
    [503, 'upstream_unavailable'],
    [400, 'upstream_error'],
  ])('search HTTP %i -> %s', async (status, kind) => {
    const fn = mockFetch(tokenOk(), json({ code: 99991663, msg: 'synthetic' }, status));
    await expectKind(readChatHistory(CONFIG, USER_A, lim(10), fn, NOW), kind);
  });

  it.each([
    [401, 'upstream_auth'],
    [403, 'upstream_auth'],
    [429, 'rate_limited'],
    [500, 'upstream_unavailable'],
  ])('token HTTP %i -> %s and no search call', async (status, kind) => {
    const fn = mockFetch(json({ code: 1 }, status));
    await expectKind(readChatHistory(CONFIG, USER_A, lim(10), fn, NOW), kind);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('nonzero Lark code on search is an error, not empty history', async () => {
    const fn = mockFetch(tokenOk(), json({ code: 1254045, msg: 'FieldNameNotFound', data: {} }));
    const p = readChatHistory(CONFIG, USER_A, lim(10), fn, NOW);
    await expectKind(p, 'upstream_error');
    await p.catch((e: HistoryError) => expect(e.larkCode).toBe(1254045));
  });

  it('nonzero Lark code on token is an error', async () => {
    const fn = mockFetch(json({ code: 10003, msg: 'invalid param' }));
    await expectKind(readChatHistory(CONFIG, USER_A, lim(10), fn, NOW), 'upstream_error');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['missing token', { code: 0 }],
    ['empty token', { code: 0, tenant_access_token: '' }],
    ['non-string token', { code: 0, tenant_access_token: 123 }],
    ['missing code', { tenant_access_token: FAKE_TOKEN }],
  ])('malformed token response: %s', async (_name, body) => {
    const fn = mockFetch(json(body));
    await expectKind(readChatHistory(CONFIG, USER_A, lim(10), fn, NOW), 'malformed_response');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['non-JSON body', () => new Response('<html>gateway</html>', { status: 200 })],
    ['array body', () => json([])],
    ['code as string', () => json({ code: '0', data: { items: [], has_more: false } })],
    ['missing data', () => json({ code: 0 })],
    ['missing has_more', () => json({ code: 0, data: { items: [] } })],
    ['items missing with nonzero total', () => json({ code: 0, data: { has_more: false, total: 3 } })],
    ['items not an array', () => json({ code: 0, data: { items: {}, has_more: false } })],
    ['item without record_id', () => json({ code: 0, data: { items: [{ fields: {} }], has_more: false } })],
    ['item without fields', () => json({ code: 0, data: { items: [{ record_id: 'rec1' }], has_more: false } })],
    ['has_more without page_token', () => json({ code: 0, data: { items: [record('rec1')], has_more: true } })],
    ['more items than requested', () => page([record('r1'), record('r2'), record('r3')])],
  ])('malformed search response: %s', async (_name, resp) => {
    const fn = mockFetch(tokenOk(), resp);
    await expectKind(readChatHistory(CONFIG, USER_A, lim(2), fn, NOW), 'malformed_response');
  });
});

const all = { mode: 'all' } as const;

function recs(from: number, to: number, tsStep = 1000) {
  const out = [];
  for (let i = from; i < to; i++) out.push(record(`r${String(i).padStart(4, '0')}`, USER_A, 'user_id', 1700000000000 + i * tsStep));
  return out;
}

describe('pagination', () => {
  it('follows page_token until has_more is false and reports complete', async () => {
    const fn = mockFetch(
      tokenOk(),
      page([record('r1'), record('r2')], true, 'pt-1'),
      page([record('r3')], false),
    );
    const result = await readChatHistory(CONFIG, USER_A, lim(10), fn, NOW);
    expect(result.records.map((r) => r.record_id)).toEqual(['r1', 'r2', 'r3']);
    expect(result).toMatchObject({ complete: true, stopReason: 'exhausted', pagesRead: 2 });

    const first = new URL(String(fn.mock.calls[1][0]));
    const second = new URL(String(fn.mock.calls[2][0]));
    expect(first.searchParams.get('page_size')).toBe('10');
    expect(first.searchParams.get('page_token')).toBeNull();
    expect(second.searchParams.get('page_size')).toBe('8');
    expect(second.searchParams.get('page_token')).toBe('pt-1');
  });

  it('stopping at limit is reported as incomplete, never complete', async () => {
    const fn = mockFetch(tokenOk(), page([record('r1'), record('r2')], true, 'pt-1'));
    const result = await readChatHistory(CONFIG, USER_A, lim(2), fn, NOW);
    expect(result).toMatchObject({ complete: false, stopReason: 'limit_reached', pagesRead: 1 });
    expect(result.records).toHaveLength(2);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('limit equal to the history size with has_more=false is complete', async () => {
    const fn = mockFetch(tokenOk(), page([record('r1'), record('r2')], false));
    await expect(readChatHistory(CONFIG, USER_A, lim(2), fn, NOW)).resolves.toMatchObject({ complete: true });
  });

  it('all mode reads every page with max page_size', async () => {
    const fn = mockFetch(tokenOk(), page(recs(0, 500), true, 'pt-1'), page(recs(500, 700), false));
    const result = await readChatHistory(CONFIG, USER_A, all, fn, NOW);
    expect(result).toMatchObject({ complete: true, stopReason: 'exhausted', pagesRead: 2 });
    expect(result.records).toHaveLength(700);
    expect(new URL(String(fn.mock.calls[1][0])).searchParams.get('page_size')).toBe('500');
    expect(new URL(String(fn.mock.calls[2][0])).searchParams.get('page_size')).toBe('500');
  });

  it('all mode stops at the record cap and reports incomplete', async () => {
    const pages = Array.from({ length: 10 }, (_, p) => page(recs(p * 500, (p + 1) * 500, 1), true, `pt-${p + 1}`));
    const fn = mockFetch(tokenOk(), ...pages);
    const result = await readChatHistory(CONFIG, USER_A, all, fn, NOW);
    expect(result).toMatchObject({ complete: false, stopReason: 'record_cap_reached', pagesRead: 10 });
    expect(result.records).toHaveLength(MAX_ALL_RECORDS);
  });

  it('all mode stops at the page cap and reports incomplete', async () => {
    let n = 0;
    const fn = vi.fn<typeof fetch>(async (input) => {
      if (String(input).includes('tenant_access_token')) return tokenOk();
      n++;
      return page(recs(n * 10, n * 10 + 1), true, `pt-${n}`);
    });
    const result = await readChatHistory(CONFIG, USER_A, all, fn, NOW);
    expect(result).toMatchObject({ complete: false, stopReason: 'page_cap_reached', pagesRead: 20 });
    expect(n).toBe(20);
  });

  it('a failing later page rejects the whole read (no partial success)', async () => {
    const fn = mockFetch(
      tokenOk(),
      page([record('r1')], true, 'pt-1'),
      json({ code: 0, msg: 'x' }, 500),
    );
    await expectKind(readChatHistory(CONFIG, USER_A, lim(10), fn, NOW), 'upstream_unavailable');
  });

  it('rejects a repeated page_token instead of looping', async () => {
    const fn = mockFetch(
      tokenOk(),
      page([record('r1')], true, 'pt-1'),
      page([record('r2')], true, 'pt-1'),
    );
    await expectKind(readChatHistory(CONFIG, USER_A, lim(10), fn, NOW), 'malformed_response');
  });

  it('rejects an empty page that claims has_more', async () => {
    const fn = mockFetch(tokenOk(), page([], true, 'pt-1'));
    await expectKind(readChatHistory(CONFIG, USER_A, all, fn, NOW), 'malformed_response');
  });

  it('rejects a duplicate record across pages', async () => {
    const fn = mockFetch(tokenOk(), page([record('r1')], true, 'pt-1'), page([record('r1')], false));
    await expectKind(readChatHistory(CONFIG, USER_A, lim(10), fn, NOW), 'malformed_response');
  });

  it('rejects a duplicate record within a page', async () => {
    const fn = mockFetch(tokenOk(), page([record('r1'), record('r1')], false));
    await expectKind(readChatHistory(CONFIG, USER_A, lim(10), fn, NOW), 'malformed_response');
  });
});

describe('timestamps and ordering', () => {
  it('returns records in stable chronological order (ties by record_id)', async () => {
    const fn = mockFetch(
      tokenOk(),
      page([record('rB', USER_A, 'user_id', 1700000000000), record('rA', USER_A, 'user_id', 1700000000000)], true, 'pt-1'),
      page([record('rC', USER_A, 'user_id', 1700000000000), record('rD', USER_A, 'user_id', 1700000000001)], false),
    );
    const result = await readChatHistory(CONFIG, USER_A, lim(10), fn, NOW);
    expect(result.records.map((r) => r.record_id)).toEqual(['rA', 'rB', 'rC', 'rD']);
  });

  it('rejects records out of chronological order across pages', async () => {
    const fn = mockFetch(
      tokenOk(),
      page([record('r1', USER_A, 'user_id', 1700000002000)], true, 'pt-1'),
      page([record('r2', USER_A, 'user_id', 1700000001000)], false),
    );
    await expectKind(readChatHistory(CONFIG, USER_A, lim(10), fn, NOW), 'malformed_response');
  });

  it.each([
    ['missing', undefined],
    ['ISO string', '2024-01-01T00:00:00.000Z'],
    ['seconds instead of ms', 1700000000],
    ['fractional', 1700000000000.5],
    ['negative', -1],
    ['NaN', Number.NaN],
    ['far future', Date.UTC(2026, 0, 3)],
  ])('rejects invalid ts: %s', async (_name, ts) => {
    const rec = record('r1');
    (rec.fields as Record<string, unknown>).ts = ts;
    const fn = mockFetch(tokenOk(), page([rec]));
    await expectKind(readChatHistory(CONFIG, USER_A, lim(10), fn, NOW), 'malformed_response');
  });

  it('parseTimestampMs accepts small clock skew', () => {
    expect(parseTimestampMs(Date.UTC(2026, 0, 1, 12), Date.UTC(2026, 0, 1))).toBe(Date.UTC(2026, 0, 1, 12));
  });
});

describe('error sanitization', () => {
  it('client responses and log descriptions never include secrets or user IDs', async () => {
    const leaky = json({ code: 99991663, msg: `token ${FAKE_TOKEN} user ${USER_A} secret synthetic-secret` }, 401);
    const fn = mockFetch(tokenOk(), leaky);
    const err = await readChatHistory(CONFIG, USER_A, lim(10), fn, NOW).catch((e) => e);
    const surfaces = [err.message, JSON.stringify(toHttpError(err)), JSON.stringify(describeError(err))].join('\n');
    for (const secret of [FAKE_TOKEN, USER_A, 'synthetic-secret']) {
      expect(surfaces).not.toContain(secret);
    }
    expect(toHttpError(err)).toEqual({ status: 502, body: { error: 'Failed to get chat history' } });
    expect(describeError(err)).toEqual({ kind: 'upstream_auth', upstreamStatus: 401, larkCode: undefined });
  });

  it('maps error kinds to HTTP statuses', () => {
    expect(toHttpError(new HistoryError('invalid_input', 'bad')).status).toBe(400);
    expect(toHttpError(new HistoryError('rate_limited', 'x')).status).toBe(503);
    expect(toHttpError(new HistoryError('config', 'x')).status).toBe(500);
    expect(toHttpError(new HistoryError('malformed_response', 'x')).status).toBe(502);
    expect(toHttpError(new Error(`boom ${USER_A}`))).toEqual({ status: 500, body: { error: 'Failed to get chat history' } });
  });
});

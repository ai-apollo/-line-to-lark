import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import handler from '../../../api/line/get-chat-history';

// Synthetic identifier; not a real LINE user.
const USER_A = 'U' + 'a'.repeat(32);

function mockRes() {
  const res = { statusCode: 0, body: undefined as unknown };
  const api = {
    status(code: number) {
      res.statusCode = code;
      return api;
    },
    json(body: unknown) {
      res.body = body;
      return api;
    },
  };
  return { res, api: api as unknown as VercelResponse };
}

describe('GET /api/line/get-chat-history', () => {
  const fetchSpy = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubEnv('LARK_APP_ID', 'cli_synthetic');
    vi.stubEnv('LARK_APP_SECRET', 'synthetic-secret');
    vi.stubEnv('LARK_APP_TOKEN', 'appSynthetic');
    vi.stubEnv('LARK_MESSAGES_TABLE_ID', 'tblSynthetic');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    fetchSpy.mockReset();
  });

  it('rejects non-GET methods', async () => {
    const { res, api } = mockRes();
    await handler({ method: 'POST', query: {} } as unknown as VercelRequest, api);
    expect(res.statusCode).toBe(405);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([
    ['valid request', { userId: USER_A, limit: '10' }, {}],
    ['with a bearer header', { userId: USER_A }, { authorization: 'Bearer anything' }],
    ['invalid input', { userId: 'x', limit: '-1' }, {}],
  ])('fails closed before any upstream call: %s', async (_name, query, headers) => {
    const { res, api } = mockRes();
    await handler({ method: 'GET', query, headers } as unknown as VercelRequest, api);
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'Chat history access is not available' });
    expect(JSON.stringify(res.body)).not.toContain(USER_A);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

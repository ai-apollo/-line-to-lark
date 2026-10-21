import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { baseCreateMessageLog } from '../../../api/lark/message-log';

// Guards that the history reader fix leaves the writer unchanged: it must keep
// writing the canonical `user_id` column to the messages table.
const USER_A = 'U' + 'a'.repeat(32);

describe('baseCreateMessageLog (writer, unchanged)', () => {
  const fetchSpy = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubEnv('LARK_APP_ID', 'cli_synthetic');
    vi.stubEnv('LARK_APP_SECRET', 'synthetic-secret');
    vi.stubEnv('LARK_APP_TOKEN', 'appSynthetic');
    vi.stubEnv('LARK_MESSAGES_TABLE_ID', 'tblSynthetic');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchSpy
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, tenant_access_token: 't-synthetic' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, data: { records: [{ record_id: 'rec1' }] } })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    fetchSpy.mockReset();
  });

  it('writes user_id to the messages table via batch_create', async () => {
    await baseCreateMessageLog({ user_id: USER_A, direction: 'incoming', ts: 1700000000000, text: 'synthetic' });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const [url, init] = fetchSpy.mock.calls[1];
    expect(String(url)).toBe(
      'https://open.larksuite.com/open-apis/bitable/v1/apps/appSynthetic/tables/tblSynthetic/records/batch_create',
    );
    const body = JSON.parse(String(init!.body));
    expect(body.records).toHaveLength(1);
    expect(body.records[0].fields.user_id).toBe(USER_A);
    expect(body.records[0].fields).not.toHaveProperty('line_user_id');
  });
});

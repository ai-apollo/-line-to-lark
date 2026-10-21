import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EXIT, runCli } from '../../scripts/read-chat-history';
import type { HistoryConfig } from '../../api/_lib/chat-history';
import type { IdentityProofSource } from '../../api/_lib/identity-preflight';

// Synthetic identifiers only.
const USER_A = 'U' + 'a'.repeat(32);
const BOT_A = { botUserId: 'U' + '1'.repeat(32) };
const BOT_B = { botUserId: 'U' + '2'.repeat(32) };
const NOW = () => Date.UTC(2026, 0, 1);
const REAL_CONFIG: HistoryConfig = {
  appId: 'cli_synthetic',
  appSecret: 'synthetic-secret-value',
  appToken: 'appSynthetic',
  tableId: 'tblSynthetic',
  userIdField: 'user_id',
};

function run(argv: string[], extra: Partial<Parameters<typeof runCli>[1]> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const p = runCli(argv, { out: (l) => out.push(l), err: (l) => err.push(l), now: NOW, ...extra });
  return p.then((code) => ({ code, out, err, all: [...out, ...err].join('\n') }));
}

function proof(channel: unknown, binding: unknown): IdentityProofSource {
  return {
    fetchChannelIdentity: vi.fn(async () => channel as never),
    fetchDataSourceBinding: vi.fn(async () => binding as never),
  };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('read-chat-history CLI', () => {
  const globalFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', globalFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    globalFetch.mockReset();
  });

  describe('argument validation (no network before validation)', () => {
    it.each([
      [[], /--user-id is required/],
      [['--user-id', 'abc'], /LINE user ID/],
      [['--user-id', USER_A, '--limit', '0'], /limit/],
      [['--user-id', USER_A, '--limit', '501'], /limit/],
      [['--user-id', USER_A, '--limit', '1.5'], /limit/],
      [['--user-id', USER_A, '--limit'], /missing value/],
      [['--user-id', USER_A, '--all', '--limit', '5'], /mutually exclusive/],
      [['--user-id', USER_A, '--user-id', USER_A], /duplicate/],
      [['--user-id', USER_A, '--mode', 'prod'], /--mode/],
      [['--user-id', USER_A, '--verified'], /unknown argument/],
      [['--user-id', USER_A, '--synthetic-count', '-1'], /synthetic-count/],
      [['--user-id', USER_A, '--mode', 'real', '--synthetic-count', '3'], /only valid/],
    ])('%j → usage error', async (argv, msg) => {
      const loadRealConfig = vi.fn(() => REAL_CONFIG);
      const realFetch = vi.fn();
      const p = proof(BOT_A, BOT_A);
      const r = await run(argv as string[], { proofSource: p, loadRealConfig, realFetch: realFetch as never });
      expect(r.code).toBe(EXIT.usage);
      expect(r.err.join('\n')).toMatch(msg);
      expect(globalFetch).not.toHaveBeenCalled();
      expect(realFetch).not.toHaveBeenCalled();
      expect(loadRealConfig).not.toHaveBeenCalled();
      expect(p.fetchChannelIdentity).not.toHaveBeenCalled();
    });
  });

  describe('synthetic mode (default)', () => {
    it('is the default and never uses the network', async () => {
      const r = await run(['--user-id', USER_A, '--all']);
      expect(r.code).toBe(EXIT.complete);
      expect(r.out[0]).toMatch(/mode: synthetic \(dry-run/);
      expect(r.out).toContain('status: COMPLETE (all records read)');
      expect(r.out).toContain('records: 7, pages: 3');
      expect(globalFetch).not.toHaveBeenCalled();
    });

    it('prints records in chronological order without text or payload by default', async () => {
      const r = await run(['--user-id', USER_A, '--all']);
      const rows = r.out.filter((l) => l.startsWith('#'));
      expect(rows).toHaveLength(7);
      const times = rows.map((l) => l.split(' ')[1]);
      expect([...times].sort()).toEqual(times);
      expect(rows[0]).toBe('#1 2024-01-01T00:00:00.000Z incoming message/text [text omitted, 19 chars]');
      expect(r.all).not.toContain('synthetic message');
      expect(r.all).not.toContain(USER_A);
      expect(r.all).toContain('Uaaaa…aaaa');
    });

    it('includes text only with --include-text', async () => {
      const r = await run(['--user-id', USER_A, '--limit', '2', '--include-text']);
      expect(r.out.filter((l) => l.startsWith('#'))[0]).toContain('"synthetic message 1"');
    });

    it('labels a limit-truncated read INCOMPLETE with a distinct exit code', async () => {
      const r = await run(['--user-id', USER_A, '--limit', '4']);
      expect(r.code).toBe(EXIT.incomplete);
      expect(r.out).toContain('status: INCOMPLETE (limit_reached: more records exist beyond --limit)');
      expect(r.out).toContain('records: 4, pages: 2');
      expect(r.all).not.toMatch(/COMPLETE \(all/);
    });

    it('reports an empty history as complete', async () => {
      const r = await run(['--user-id', USER_A, '--synthetic-count', '0']);
      expect(r.code).toBe(EXIT.complete);
      expect(r.out).toContain('records: 0, pages: 1');
    });

    it('all mode reports the page cap as incomplete', async () => {
      const r = await run(['--user-id', USER_A, '--all', '--synthetic-count', '60']);
      // 3 records per synthetic page × 20-page cap = 60 records, but has_more is false on the last page
      expect(r.code).toBe(EXIT.complete);
      const capped = await run(['--user-id', USER_A, '--all', '--synthetic-count', '61']);
      expect(capped.code).toBe(EXIT.incomplete);
      expect(capped.out).toContain('status: INCOMPLETE (page_cap_reached: page cap reached before the end of the history)');
    });
  });

  describe('real mode', () => {
    it('is disabled in this repository: fails closed without config, proof calls or network', async () => {
      const r = await run(['--user-id', USER_A, '--mode', 'real']);
      expect(r.code).toBe(EXIT.realModeRefused);
      expect(r.err[0]).toMatch(/real mode is disabled: no verifiable LINE channel \/ Lark data source identity proof/);
      expect(r.out).toEqual([]);
      expect(globalFetch).not.toHaveBeenCalled();
    });

    it.each([
      ['identity mismatch', proof(BOT_A, BOT_B), 'identity_mismatch'],
      ['missing data source binding', proof(BOT_A, null), 'missing_data_source_binding'],
      ['missing channel identity', proof(null, BOT_A), 'missing_channel_identity'],
    ])('refuses on %s before any Lark call', async (_name, p, reason) => {
      const realFetch = vi.fn();
      const r = await run(['--user-id', USER_A, '--mode', 'real'], {
        proofSource: p,
        loadRealConfig: () => REAL_CONFIG,
        realFetch: realFetch as never,
      });
      expect(r.code).toBe(EXIT.realModeRefused);
      expect(r.err[0]).toBe(`error: real mode refused: identity preflight failed (${reason})`);
      expect(realFetch).not.toHaveBeenCalled();
      expect(p.fetchDataSourceBinding).toHaveBeenCalledWith({ appToken: 'appSynthetic', tableId: 'tblSynthetic' });
    });

    it('a bare flag or env claim is not proof', async () => {
      vi.stubEnv('LINE_BOT_USER_ID', BOT_A.botUserId);
      const r = await run(['--user-id', USER_A, '--mode', 'real']);
      vi.unstubAllEnvs();
      expect(r.code).toBe(EXIT.realModeRefused);
    });

    it('with matching (mocked) proof, reads via the injected client and stays secret-free', async () => {
      const realFetch = vi.fn<typeof fetch>()
        .mockResolvedValueOnce(json({ code: 0, tenant_access_token: 't-synthetic-token' }))
        .mockResolvedValueOnce(json({
          code: 0,
          data: {
            has_more: false,
            items: [{ record_id: 'rec1', fields: { user_id: USER_A, ts: 1700000000000, direction: 'incoming', text: 'synthetic', payload: '{"secret":"p"}' } }],
          },
        }));
      const r = await run(['--user-id', USER_A, '--mode', 'real', '--all'], {
        proofSource: proof(BOT_A, BOT_A),
        loadRealConfig: () => REAL_CONFIG,
        realFetch,
      });
      expect(r.code).toBe(EXIT.complete);
      expect(r.out).toContain('records: 1, pages: 1');
      for (const s of ['synthetic-secret-value', 't-synthetic-token', USER_A, '"secret"', 'synthetic"']) {
        expect(r.all).not.toContain(s);
      }
      expect(globalFetch).not.toHaveBeenCalled();
    });

    it('reports provider errors explicitly and prints no partial records', async () => {
      const realFetch = vi.fn<typeof fetch>()
        .mockResolvedValueOnce(json({ code: 0, tenant_access_token: 't-synthetic-token' }))
        .mockResolvedValueOnce(json({
          code: 0,
          data: { has_more: true, page_token: 'pt-1', items: [{ record_id: 'rec1', fields: { user_id: USER_A, ts: 1700000000000 } }] },
        }))
        .mockResolvedValueOnce(json({ code: 0 }, 429));
      const r = await run(['--user-id', USER_A, '--mode', 'real', '--all'], {
        proofSource: proof(BOT_A, BOT_A),
        loadRealConfig: () => REAL_CONFIG,
        realFetch,
      });
      expect(r.code).toBe(EXIT.readError);
      expect(r.out).toEqual([]);
      expect(r.err[0]).toBe('error: read failed, no records returned {"kind":"rate_limited","upstreamStatus":429}');
    });

    it('reports a nonzero Lark code explicitly', async () => {
      const realFetch = vi.fn<typeof fetch>()
        .mockResolvedValueOnce(json({ code: 0, tenant_access_token: 't-synthetic-token' }))
        .mockResolvedValueOnce(json({ code: 1254045, msg: 'FieldNameNotFound' }));
      const r = await run(['--user-id', USER_A, '--mode', 'real'], {
        proofSource: proof(BOT_A, BOT_A),
        loadRealConfig: () => REAL_CONFIG,
        realFetch,
      });
      expect(r.code).toBe(EXIT.readError);
      expect(r.err[0]).toContain('"kind":"upstream_error"');
      expect(r.err[0]).toContain('"larkCode":1254045');
    });
  });
});

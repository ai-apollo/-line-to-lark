import { describe, expect, it, vi } from 'vitest';
import {
  IdentityProofSource,
  preflightIdentity,
  realIdentityProofSource,
} from '../../../api/_lib/identity-preflight';

// Synthetic bot identities; not real LINE channels.
const BOT_A = { botUserId: 'U' + '1'.repeat(32) };
const BOT_B = { botUserId: 'U' + '2'.repeat(32) };
const SOURCE = { appToken: 'appSynthetic', tableId: 'tblSynthetic' };

function proof(channel: unknown, binding: unknown): IdentityProofSource {
  return {
    fetchChannelIdentity: vi.fn(async () => channel as never),
    fetchDataSourceBinding: vi.fn(async () => binding as never),
  };
}

describe('preflightIdentity', () => {
  it('has no real proof source in this repository (real mode disabled)', () => {
    expect(realIdentityProofSource()).toBeNull();
  });

  it('fails without a proof source', async () => {
    await expect(preflightIdentity(null, SOURCE)).resolves.toEqual({ ok: false, reason: 'missing_proof_source' });
  });

  it('fails when the channel identity is missing', async () => {
    await expect(preflightIdentity(proof(null, BOT_A), SOURCE)).resolves.toEqual({ ok: false, reason: 'missing_channel_identity' });
  });

  it('fails when the data source binding is missing', async () => {
    await expect(preflightIdentity(proof(BOT_A, null), SOURCE)).resolves.toEqual({ ok: false, reason: 'missing_data_source_binding' });
  });

  it('fails on identity mismatch', async () => {
    await expect(preflightIdentity(proof(BOT_A, BOT_B), SOURCE)).resolves.toEqual({ ok: false, reason: 'identity_mismatch' });
  });

  it.each([
    ['empty', { botUserId: '' }],
    ['wrong format', { botUserId: 'clinic-a' }],
    ['non-string', { botUserId: 1 }],
  ])('fails on invalid identity: %s', async (_name, bad) => {
    await expect(preflightIdentity(proof(bad, bad), SOURCE)).resolves.toEqual({ ok: false, reason: 'invalid_identity' });
  });

  it('fails closed when a proof provider throws', async () => {
    const p: IdentityProofSource = {
      fetchChannelIdentity: async () => {
        throw new Error('network');
      },
      fetchDataSourceBinding: async () => BOT_A,
    };
    await expect(preflightIdentity(p, SOURCE)).resolves.toEqual({ ok: false, reason: 'proof_unavailable' });
  });

  it('passes only when both provider-verified identities match, and checks the configured source', async () => {
    const p = proof(BOT_A, BOT_A);
    await expect(preflightIdentity(p, SOURCE)).resolves.toEqual({ ok: true, identity: BOT_A });
    expect(p.fetchDataSourceBinding).toHaveBeenCalledWith(SOURCE);
  });
});

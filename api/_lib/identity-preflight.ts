// Identity preflight for reading real chat history outside the web runtime.
//
// A real read is allowed only when two independent, provider-verified facts agree:
//   1. the LINE channel the runtime's credentials belong to (e.g. the bot userId
//      returned by LINE `GET /v2/bot/info` for LINE_CHANNEL_ACCESS_TOKEN), and
//   2. the LINE channel the configured Lark data source (app token + table) attests
//      it stores messages for.
// A CLI flag, env var or other caller-supplied claim is never accepted as either fact.

const LINE_BOT_USER_ID_RE = /^U[0-9a-f]{32}$/;

export type DataSourceRef = { appToken: string; tableId: string };

export type ChannelIdentity = { botUserId: string };

export interface IdentityProofSource {
  // Identity of the channel owning the runtime's LINE credentials, verified with LINE.
  fetchChannelIdentity(): Promise<ChannelIdentity | null>;
  // Channel identity the configured data source attests it belongs to, read from Lark.
  fetchDataSourceBinding(source: DataSourceRef): Promise<ChannelIdentity | null>;
}

export type PreflightFailure =
  | 'missing_proof_source'
  | 'missing_channel_identity'
  | 'missing_data_source_binding'
  | 'invalid_identity'
  | 'identity_mismatch'
  | 'proof_unavailable';

export type PreflightResult =
  | { ok: true; identity: ChannelIdentity }
  | { ok: false; reason: PreflightFailure };

// No reliable proof source exists in this repository yet:
// - nothing in the Lark Base records which LINE channel it belongs to (the webhook
//   does not persist the webhook `destination` / bot userId, and there is no
//   channel-binding table or record), and
// - there is no reviewed LINE `/v2/bot/info` client in the runtime.
// Until both exist and are reviewed, real mode stays disabled.
export function realIdentityProofSource(): IdentityProofSource | null {
  return null;
}

function validIdentity(v: ChannelIdentity | null): v is ChannelIdentity {
  return v !== null && typeof v === 'object' && typeof v.botUserId === 'string' && LINE_BOT_USER_ID_RE.test(v.botUserId);
}

export async function preflightIdentity(
  proof: IdentityProofSource | null,
  source: DataSourceRef,
): Promise<PreflightResult> {
  if (!proof) return { ok: false, reason: 'missing_proof_source' };

  let channel: ChannelIdentity | null;
  let binding: ChannelIdentity | null;
  try {
    channel = await proof.fetchChannelIdentity();
    binding = await proof.fetchDataSourceBinding(source);
  } catch {
    return { ok: false, reason: 'proof_unavailable' };
  }

  if (channel === null || channel === undefined) return { ok: false, reason: 'missing_channel_identity' };
  if (binding === null || binding === undefined) return { ok: false, reason: 'missing_data_source_binding' };
  if (!validIdentity(channel) || !validIdentity(binding)) return { ok: false, reason: 'invalid_identity' };
  if (channel.botUserId !== binding.botUserId) return { ok: false, reason: 'identity_mismatch' };
  return { ok: true, identity: { botUserId: channel.botUserId } };
}

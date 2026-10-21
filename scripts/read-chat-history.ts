// Non-public CLI for the private chat history reader (api/_lib/chat-history.ts).
//
//   npx ts-node scripts/read-chat-history.ts --user-id U<32 hex> [--limit N | --all] [--include-text]
//
// Default mode is synthetic: an in-process fake Lark serves generated records, so
// no credentials are read and no network request is made.
// `--mode real` is refused unless the identity preflight (api/_lib/identity-preflight.ts)
// proves the runtime's LINE channel matches the configured Lark data source. No
// proof source exists yet, so real mode currently always fails closed.
import {
  DEFAULT_LIMIT,
  HistoryConfig,
  HistoryError,
  HistoryRecord,
  HistoryResult,
  MAX_ALL_RECORDS,
  ReadOptions,
  describeError,
  loadHistoryConfig,
  parseLimit,
  parseUserId,
  readChatHistory,
} from '../api/_lib/chat-history';
import {
  IdentityProofSource,
  preflightIdentity,
  realIdentityProofSource,
} from '../api/_lib/identity-preflight';

export const EXIT = {
  complete: 0,
  usage: 2,
  realModeRefused: 3,
  readError: 4,
  incomplete: 5,
} as const;

const USAGE = `usage: read-chat-history --user-id <LINE user ID> [--limit 1-500 | --all] [--include-text]
                         [--mode synthetic|real] [--synthetic-count 0-${MAX_ALL_RECORDS}]
  --mode synthetic (default) uses generated records only: no credentials, no network.
  --mode real requires a verified LINE channel / Lark data source identity preflight.
  Message text is omitted unless --include-text is given; payload/raw_json are never printed.`;

export type CliArgs = {
  userId: string;
  read: ReadOptions;
  mode: 'synthetic' | 'real';
  includeText: boolean;
  syntheticCount: number;
};

class UsageError extends Error {}

const VALUE_FLAGS = new Set(['--user-id', '--limit', '--mode', '--synthetic-count']);
const BOOL_FLAGS = new Set(['--all', '--include-text', '--help']);

export function parseArgs(argv: string[]): CliArgs | 'help' {
  const values = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (!VALUE_FLAGS.has(flag) && !BOOL_FLAGS.has(flag)) throw new UsageError(`unknown argument: ${flag.slice(0, 40)}`);
    if (values.has(flag)) throw new UsageError(`duplicate argument: ${flag}`);
    if (VALUE_FLAGS.has(flag)) {
      const value = argv[++i];
      if (value === undefined || value.startsWith('--')) throw new UsageError(`missing value for ${flag}`);
      values.set(flag, value);
    } else {
      values.set(flag, true);
    }
  }
  if (values.has('--help')) return 'help';

  const userIdRaw = values.get('--user-id');
  if (userIdRaw === undefined) throw new UsageError('--user-id is required');
  const userId = asUsage(() => parseUserId(userIdRaw));

  if (values.has('--all') && values.has('--limit')) throw new UsageError('--all and --limit are mutually exclusive');
  const read: ReadOptions = values.has('--all')
    ? { mode: 'all' }
    : { mode: 'limit', limit: asUsage(() => parseLimit(values.get('--limit') ?? String(DEFAULT_LIMIT))) };

  const mode = values.get('--mode') ?? 'synthetic';
  if (mode !== 'synthetic' && mode !== 'real') throw new UsageError('--mode must be synthetic or real');

  let syntheticCount = 7;
  const countRaw = values.get('--synthetic-count');
  if (countRaw !== undefined) {
    if (mode !== 'synthetic') throw new UsageError('--synthetic-count is only valid with --mode synthetic');
    if (typeof countRaw !== 'string' || !/^[0-9]{1,5}$/.test(countRaw) || Number(countRaw) > MAX_ALL_RECORDS) {
      throw new UsageError(`--synthetic-count must be an integer between 0 and ${MAX_ALL_RECORDS}`);
    }
    syntheticCount = Number(countRaw);
  }

  return { userId, read, mode, includeText: values.has('--include-text'), syntheticCount };
}

function asUsage<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof HistoryError) throw new UsageError(err.message);
    throw err;
  }
}

// --- synthetic data source -------------------------------------------------

export const SYNTHETIC_CONFIG: HistoryConfig = {
  appId: 'synthetic-app',
  appSecret: 'synthetic-secret',
  appToken: 'synthetic-app-token',
  tableId: 'synthetic-table',
  userIdField: 'user_id',
};
const SYNTHETIC_BASE_TS = Date.UTC(2024, 0, 1);
const SYNTHETIC_MAX_PAGE_SIZE = 3; // small so paging is exercised

// In-process fake of the two Lark endpoints the reader uses. Never touches the network.
export function syntheticLarkFetch(userId: string, count: number): typeof fetch {
  return async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/auth/v3/tenant_access_token/internal')) {
      return new Response(JSON.stringify({ code: 0, tenant_access_token: 'synthetic-token', expire: 7200 }));
    }
    if (url.pathname.endsWith('/records/search')) {
      const pageSize = Math.min(Number(url.searchParams.get('page_size')), SYNTHETIC_MAX_PAGE_SIZE);
      const offset = Number(url.searchParams.get('page_token')?.replace('syn-', '') ?? '0');
      const end = Math.min(offset + pageSize, count);
      const items = [];
      for (let i = offset; i < end; i++) {
        items.push({
          record_id: `recSyn${String(i).padStart(5, '0')}`,
          fields: {
            user_id: userId,
            ts: SYNTHETIC_BASE_TS + i * 60_000,
            direction: i % 2 === 0 ? 'incoming' : 'outgoing',
            event_type: 'message',
            message_type: 'text',
            text: `synthetic message ${i + 1}`,
          },
        });
      }
      const hasMore = end < count;
      return new Response(JSON.stringify({
        code: 0,
        data: { items, has_more: hasMore, page_token: hasMore ? `syn-${end}` : undefined, total: count },
      }));
    }
    return new Response(JSON.stringify({ code: 404 }), { status: 404 });
  };
}

// --- output ------------------------------------------------------------------

export function maskUserId(userId: string): string {
  return `${userId.slice(0, 5)}…${userId.slice(-4)}`;
}

const STOP_REASON_TEXT: Record<HistoryResult['stopReason'], string> = {
  exhausted: 'all records read',
  limit_reached: 'more records exist beyond --limit',
  record_cap_reached: `more records exist beyond the ${MAX_ALL_RECORDS}-record cap`,
  page_cap_reached: 'page cap reached before the end of the history',
};

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function formatRecord(record: HistoryRecord, index: number, includeText: boolean): string {
  const f = record.fields;
  const ts = new Date(f.ts as number).toISOString();
  const text = str(f.text);
  const body = includeText ? JSON.stringify(text) : `[text omitted, ${text.length} chars]`;
  return `#${index + 1} ${ts} ${str(f.direction) || '-'} ${str(f.event_type) || '-'}/${str(f.message_type) || '-'} ${body}`;
}

export function formatResult(args: CliArgs, result: HistoryResult): string[] {
  const status = result.complete
    ? 'status: COMPLETE (all records read)'
    : `status: INCOMPLETE (${result.stopReason}: ${STOP_REASON_TEXT[result.stopReason]})`;
  return [
    `mode: ${args.mode}${args.mode === 'synthetic' ? ' (dry-run: synthetic data, no network)' : ''}`,
    `user: ${maskUserId(args.userId)}`,
    status,
    `records: ${result.records.length}, pages: ${result.pagesRead}`,
    ...result.records.map((r, i) => formatRecord(r, i, args.includeText)),
  ];
}

// --- entry point -------------------------------------------------------------

export type CliDeps = {
  out: (line: string) => void;
  err: (line: string) => void;
  // Real-mode dependencies. Tests inject mocks; production uses the defaults.
  proofSource?: IdentityProofSource | null;
  loadRealConfig?: () => HistoryConfig;
  realFetch?: typeof fetch;
  now?: () => number;
};

export async function runCli(argv: string[], deps: CliDeps): Promise<number> {
  let args: CliArgs | 'help';
  try {
    args = parseArgs(argv);
  } catch (err) {
    if (!(err instanceof UsageError)) throw err;
    deps.err(`error: ${err.message}`);
    deps.err(USAGE);
    return EXIT.usage;
  }
  if (args === 'help') {
    deps.out(USAGE);
    return EXIT.complete;
  }

  let config: HistoryConfig;
  let fetchImpl: typeof fetch;
  if (args.mode === 'synthetic') {
    config = SYNTHETIC_CONFIG;
    fetchImpl = syntheticLarkFetch(args.userId, args.syntheticCount);
  } else {
    const proof = deps.proofSource === undefined ? realIdentityProofSource() : deps.proofSource;
    if (!proof) {
      deps.err('error: real mode is disabled: no verifiable LINE channel / Lark data source identity proof is available');
      return EXIT.realModeRefused;
    }
    try {
      config = (deps.loadRealConfig ?? (() => loadHistoryConfig(process.env)))();
    } catch (err) {
      deps.err(`error: ${JSON.stringify(describeError(err))}`);
      return EXIT.realModeRefused;
    }
    const preflight = await preflightIdentity(proof, { appToken: config.appToken, tableId: config.tableId });
    if (!preflight.ok) {
      deps.err(`error: real mode refused: identity preflight failed (${preflight.reason})`);
      return EXIT.realModeRefused;
    }
    fetchImpl = deps.realFetch ?? fetch;
  }

  let result: HistoryResult;
  try {
    result = await readChatHistory(config, args.userId, args.read, fetchImpl, deps.now);
  } catch (err) {
    // No partial output: a failed read prints no records.
    const d = describeError(err);
    deps.err(`error: read failed, no records returned ${JSON.stringify(d)}`);
    return EXIT.readError;
  }

  for (const line of formatResult(args, result)) deps.out(line);
  return result.complete ? EXIT.complete : EXIT.incomplete;
}

if (require.main === module) {
  runCli(process.argv.slice(2), {
    out: (l) => console.log(l),
    err: (l) => console.error(l),
  }).then((code) => {
    process.exitCode = code;
  });
}

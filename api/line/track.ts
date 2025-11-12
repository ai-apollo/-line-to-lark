import type { VercelRequest, VercelResponse } from '@vercel/node';

type SourceLabel = 'direct' | 'liff' | 'X' | 'note' | 'LP' | 'ads' | 'LINE_unfollow';

let SOURCE_DICT: Record<SourceLabel, string> = {} as any;
let dictInitialized = false;

async function getLarkToken() {
  const resp = await fetch(
    'https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: process.env.LARK_APP_ID,
        app_secret: process.env.LARK_APP_SECRET,
      }),
    }
  );
  const j: any = await resp.json();
  return j.tenant_access_token;
}

async function buildSourceDict() {
  if (dictInitialized) return;

  try {
    const token = await getLarkToken();
    const resp = await fetch(
      `https://open.larksuite.com/open-apis/bitable/v1/apps/${process.env.LARK_APP_TOKEN}/tables/${process.env.LARK_TABLE_ID}/fields`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const meta: any = await resp.json();

    const map: Record<string, string> = {};
    for (const f of meta?.data?.items || []) {
      if (f.field_name === 'source') {
        for (const opt of f.property?.options || []) {
          map[String(opt.name).toLowerCase()] = opt.id;
        }
      }
    }

    SOURCE_DICT = {
      direct: map['direct'] || 'opt309346094',
      liff: map['liff'] || 'optOFn2osL',
      X: map['x'] || 'optqRXvjoQ',
      note: map['note'] || 'opt554171163',
      LP: map['lp'] || 'optpu3tsBy',
      ads: map['ads'] || 'optD08TRT9',
      LINE_unfollow: map['line_unfollow'] || 'opt1446290028',
    } as any;

    dictInitialized = true;
    console.log('✅ SOURCE_DICT built:', SOURCE_DICT);
  } catch (error) {
    console.error('❌ Failed to build SOURCE_DICT:', error);
    // Fallback to hardcoded values
    SOURCE_DICT = {
      direct: 'opt309346094',
      liff: 'optOFn2osL',
      X: 'optqRXvjoQ',
      note: 'opt554171163',
      LP: 'optpu3tsBy',
      ads: 'optD08TRT9',
      LINE_unfollow: 'opt1446290028',
    };
  }
}

// Single Select fields: send string value directly (not {id: "opt..."})
function toSource(label: SourceLabel): string {
  return label; // Return the label directly as string
}

async function baseFindByUserId(userId: string) {
  const token = await getLarkToken();
  const resp = await fetch(
    `https://open.larksuite.com/open-apis/bitable/v1/apps/${process.env.LARK_APP_TOKEN}/tables/${process.env.LARK_TABLE_ID}/records/search`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filter: {
          logic: 'AND',
          conditions: [
            { field_name: 'user_id', operator: 'equals', value: [userId] }
          ],
        },
        page_size: 1,
      }),
    }
  );
  const j: any = await resp.json();
  return j?.data?.items?.[0];
}

async function baseCreate(fields: any) {
  const token = await getLarkToken();
  const resp = await fetch(
    `https://open.larksuite.com/open-apis/bitable/v1/apps/${process.env.LARK_APP_TOKEN}/tables/${process.env.LARK_TABLE_ID}/records/batch_create`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ records: [{ fields }] }),
    }
  );
  if (!resp.ok) console.error('Create Error:', await resp.text());
}

async function baseUpdate(recordId: string, fields: any) {
  const token = await getLarkToken();
  const resp = await fetch(
    `https://open.larksuite.com/open-apis/bitable/v1/apps/${process.env.LARK_APP_TOKEN}/tables/${process.env.LARK_TABLE_ID}/records/${recordId}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields }),
    }
  );
  if (!resp.ok) console.error('Update Error:', await resp.text());
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  console.log('ENV', {
    vercelEnv: process.env.VERCEL_ENV,
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7),
    appToken: process.env.LARK_APP_TOKEN,
    tableId: process.env.LARK_TABLE_ID,
    msgTableId: process.env.LARK_MESSAGES_TABLE_ID,
  });

  // Build source options dictionary on first request
  await buildSourceDict();

  const { userId, displayName, pictureUrl, source } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  try {
    const rec = await baseFindByUserId(userId);

    // Use source from query parameter, default to 'liff'
    const sourceLabel = (source || 'liff') as SourceLabel;

    if (rec) {
      await baseUpdate(rec.record_id, {
        source: toSource(sourceLabel),
        name: displayName || rec.fields.name || '',
        profile_image_url: pictureUrl || rec.fields.profile_image_url || '',
        last_active_date: Date.now() + (60 * 60 * 1000), // +1時間調整
      });
    } else {
      const now = Date.now() + (60 * 60 * 1000); // +1時間調整
      await baseCreate({
        user_id: userId,
        name: displayName || '',
        profile_image_url: pictureUrl || '',
        source: toSource(sourceLabel),
        day: now,
        joined_at: now,
        engagement_score: 0,
        total_interactions: 0,
        last_active_date: now,
      });
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Track error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

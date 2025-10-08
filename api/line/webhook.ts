import type { VercelRequest, VercelResponse } from '@vercel/node';

// ===== Lark Token取得 =====
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
  const j = await resp.json();
  return j.tenant_access_token as string;
}

// ===== レコード検索 =====
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
            { field_name: 'line_user_id', operator: 'equals', value: [userId] }
          ],
        },
        page_size: 1,
      }),
    }
  );
  const j = await resp.json();
  return j?.data?.items?.[0];
}

// ===== レコード作成 =====
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

// ===== レコード更新 =====
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

// ===== メイン処理 =====
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const events = req.body?.events || [];
  for (const event of events) {
    const userId = event.source?.userId;
    if (!userId) continue;

    // 1) follow: 友だち追加
    if (event.type === 'follow') {
      const rec = await baseFindByUserId(userId);

      if (rec) {
        // LIFF経由ですでに登録済み → joined_atだけ更新
        await baseUpdate(rec.record_id, {
          joined_at: Date.now(),
          last_active_date: Date.now(),
        });
      } else {
        // LIFF未経由の直接追加
        const profResp = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
          headers: { Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` },
        });
        const profile = await profResp.json().catch(() => ({} as any));

        const now = Date.now();
        await baseCreate({
          line_user_id: userId,
          display_name: profile?.displayName || '',
          profile_image_url: profile?.pictureUrl ? { link: profile.pictureUrl } : null,
          joined_at: now,
          entry_date: now,
          entry_source: 'direct',
          engagement_score: 0,
          total_interactions: 0,
          last_active_date: now,
        });
      }
    }

    // 2) message: テキストメッセージ受信
    if (event.type === 'message' && event.message?.type === 'text') {
      let rec = await baseFindByUserId(userId);
      if (!rec) {
        const now = Date.now();
        await baseCreate({
          line_user_id: userId,
          display_name: '',
          profile_image_url: null,
          joined_at: now,
          entry_date: now,
          entry_source: 'direct',
          engagement_score: 0,
          total_interactions: 0,
          last_active_date: now,
        });
        rec = await baseFindByUserId(userId);
      }

      const current = rec?.fields || {};
      await baseUpdate(rec.record_id, {
        first_message_text: current.first_message_text || String(event.message.text),
        engagement_score: (current.engagement_score || 0) + 1,
        total_interactions: (current.total_interactions || 0) + 1,
        last_active_date: Date.now(),
      });
    }
  }

  res.status(200).end();
}

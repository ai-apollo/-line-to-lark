import type { VercelRequest, VercelResponse } from '@vercel/node';
import { baseCreateMessageLog } from '../lark/message-log';

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
      const now = Date.now();
      const nowIso = new Date(now).toISOString();

      if (rec) {
        // LIFF経由ですでに登録済み → joined_atだけ更新
        await baseUpdate(rec.record_id, {
          joined_at: now,
          last_active_date: now,
          is_blocked: false,
        });

        await baseCreateMessageLog({
          message_record_id: `${now}`,
          line_user_id: userId,
          direction: 'system',
          event_type: 'follow',
          message_type: 'system',
          text: 'followed',
          ts: nowIso,
          raw_json: JSON.stringify(event),
          parent_user: rec.record_id ? [rec.record_id] : undefined,
        });
      } else {
        // LIFF未経由の直接追加
        const profResp = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
          headers: { Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` },
        });
        const profile = await profResp.json().catch(() => ({} as any));

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
          is_blocked: false,
        });

        await baseCreateMessageLog({
          message_record_id: `${now}`,
          line_user_id: userId,
          direction: 'system',
          event_type: 'follow',
          message_type: 'system',
          text: 'followed',
          ts: nowIso,
          raw_json: JSON.stringify(event),
        });
      }
    }

    // 2) message: テキストメッセージ受信
    if (event.type === 'message' && event.message?.type === 'text') {
      let rec = await baseFindByUserId(userId);
      const createdAt = Date.now();
      if (!rec) {
        await baseCreate({
          line_user_id: userId,
          display_name: '',
          profile_image_url: null,
          joined_at: createdAt,
          entry_date: createdAt,
          entry_source: 'direct',
          engagement_score: 0,
          total_interactions: 0,
          last_active_date: createdAt,
          is_blocked: false,
        });
        rec = await baseFindByUserId(userId);
      }

      if (!rec) {
        console.error('Failed to find or create record for user:', userId);
        continue;
      }

      const recordId = rec.record_id;
      if (!recordId) {
        console.error('No record ID found for record:', rec);
        continue;
      }

      const current = rec.fields || {};
      const updateTimestamp = Date.now();
      await baseUpdate(recordId, {
        first_message_text: current.first_message_text || String(event.message.text),
        engagement_score: (current.engagement_score || 0) + 1,
        total_interactions: (current.total_interactions || 0) + 1,
        last_active_date: updateTimestamp,
      });

      const text = event.message.text ?? '';
      const messageId = (event.message as any)?.id;

      await baseCreateMessageLog({
        message_record_id: `${Date.now()}-${messageId ?? ''}`,
        line_user_id: userId,
        direction: 'incoming',
        event_type: 'message',
        message_type: 'text',
        text,
        payload: '',
        ts: new Date(updateTimestamp).toISOString(),
        message_id: messageId,
        raw_json: JSON.stringify(event),
        parent_user: [recordId],
      });
    }

    if (event.type === 'postback') {
      const data = event.postback?.data ?? '';
      await baseCreateMessageLog({
        message_record_id: `${Date.now()}`,
        line_user_id: userId,
        direction: 'incoming',
        event_type: 'postback',
        message_type: 'postback',
        text: '',
        payload: data,
        ts: new Date().toISOString(),
        raw_json: JSON.stringify(event),
      });
    }

    // 3) ブロック／削除（unfollow）
    if (event.type === 'unfollow') {
      const rec = await baseFindByUserId(userId);
      const now = Date.now();

      if (rec?.record_id) {
        await baseUpdate(rec.record_id, {
          is_blocked: true,
          unsubscribed_at: now,
          last_active_date: now,
          entry_source: 'LINE_unfollow',
        });
      } else {
        await baseCreate({
          line_user_id: userId,
          is_blocked: true,
          unsubscribed_at: now,
          entry_date: now,
          last_active_date: now,
          entry_source: 'LINE_unfollow',
          engagement_score: 0,
          total_interactions: 0,
        });
      }

      await baseCreateMessageLog({
        message_record_id: `${Date.now()}`,
        line_user_id: userId,
        direction: 'system',
        event_type: 'unfollow',
        message_type: 'system',
        text: 'unfollowed',
        ts: new Date().toISOString(),
        raw_json: JSON.stringify(event),
        parent_user: rec?.record_id ? [rec.record_id] : undefined,
      });
    }
  }

  res.status(200).end();
}

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { baseCreateMessageLog } from '../lark/message-log';

// Helper function to format text fields for Bitable
function textField(value: string) {
  return value ? [{ text: value, type: 'text' }] : undefined;
}

// Helper function to extract text from Bitable text field
function getTextField(field: any): string {
  if (!field) return '';
  if (typeof field === 'string') return field;
  if (Array.isArray(field) && field[0]?.text) return field[0].text;
  return '';
}

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
  return j.tenant_access_token as string;
}

async function getLineProfile(userId: string) {
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!accessToken) return null;

  try {
    const resp = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!resp.ok) {
      console.error('❌ LINE Profile API Error:', await resp.text());
      return null;
    }

    const profile: any = await resp.json();
    return {
      displayName: profile.displayName,
      pictureUrl: profile.pictureUrl,
      statusMessage: profile.statusMessage,
    };
  } catch (error) {
    console.error('❌ Failed to get LINE profile:', error);
    return null;
  }
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

async function baseCreate(fields: any): Promise<{ record_id: string; fields: any } | null> {
  const token = await getLarkToken();
  console.log('🔵 Creating new record');
  console.log('🔵 Create fields:', JSON.stringify(fields, null, 2));

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

  if (!resp.ok) {
    const errorText = await resp.text();
    console.error('❌ Create Error:', resp.status, errorText);
    return null;
  }

  const result: any = await resp.json();
  console.log('✅ Create response:', JSON.stringify(result, null, 2));

  const record = result?.data?.records?.[0];
  if (!record?.record_id) return null;

  console.log('✅ Record created successfully:', record.record_id);
  return { record_id: record.record_id, fields };
}

async function baseUpdate(recordId: string, fields: any) {
  const token = await getLarkToken();
  console.log('🔵 Updating record:', recordId);
  console.log('🔵 Update fields:', JSON.stringify(fields, null, 2));

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

  if (!resp.ok) {
    const errorText = await resp.text();
    console.error('❌ Update Error:', resp.status, errorText);
    throw new Error(`Update failed: ${errorText}`);
  } else {
    console.log('✅ Record updated successfully');
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  console.log('🟢 Webhook received');

  const events = req.body?.events || [];
  for (const event of events) {
    const userId = event.source?.userId;
    if (!userId) continue;

    console.log('🟢 Processing event:', event.type, 'for user:', userId);

    if (event.type === 'follow') {
      const now = Date.now();
      const nowIso = new Date(now).toISOString();

      // LINEプロフィール情報を取得
      const profile = await getLineProfile(userId);
      console.log('📱 LINE Profile:', profile);

      let rec = await baseFindByUserId(userId);
      if (rec?.record_id) {
        // 既存レコードを更新（プロフィール情報も更新）
        await baseUpdate(rec.record_id, {
          name: textField(profile?.displayName || getTextField(rec.fields.name)),
          profile_image_url: textField(profile?.pictureUrl || getTextField(rec.fields.profile_image_url)),
          status_message: textField(profile?.statusMessage || getTextField(rec.fields.status_message)),
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
          parent_user: [rec.record_id],
        });
      } else {
        // 新規レコードを作成（プロフィール情報を含める）
        const created = await baseCreate({
          user_id: textField(userId),
          name: textField(profile?.displayName || ''),
          profile_image_url: textField(profile?.pictureUrl || ''),
          status_message: textField(profile?.statusMessage || ''),
          joined_at: now,
          day: now,
          source: 'direct',
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
          parent_user: created?.record_id ? [created.record_id] : undefined,
        });
      }
      continue;
    }

    if (event.type === 'message' && event.message?.type === 'text') {
      console.log('🟡 Message event detected');

      let rec = await baseFindByUserId(userId);
      const createdAt = Date.now();

      if (!rec) {
        // レコードがない場合、プロフィール情報を取得して作成
        const profile = await getLineProfile(userId);
        console.log('📱 LINE Profile (message):', profile);

        const created = await baseCreate({
          user_id: textField(userId),
          name: textField(profile?.displayName || ''),
          profile_image_url: textField(profile?.pictureUrl || ''),
          status_message: textField(profile?.statusMessage || ''),
          joined_at: createdAt,
          day: createdAt,
          source: 'direct',
          engagement_score: 0,
          total_interactions: 0,
          last_active_date: createdAt,
          is_blocked: false,
        });
        if (created?.record_id) {
          rec = { record_id: created.record_id, fields: created.fields } as any;
        } else {
          rec = await baseFindByUserId(userId);
        }
      }

      if (!rec) {
        console.error('❌ Failed to find or create record');
        continue;
      }

      const recordId = rec.record_id;
      if (!recordId) {
        console.error('❌ Record missing record_id:', rec);
        continue;
      }

      const current = rec.fields || {};
      const updateTimestamp = Date.now();

      await baseUpdate(recordId, {
        first_message_text: textField(getTextField(current.first_message_text) || String(event.message.text)),
        engagement_score: (current.engagement_score || 0) + 1,
        total_interactions: (current.total_interactions || 0) + 1,
        last_active_date: updateTimestamp,
      });

      const text = event.message.text ?? '';
      const messageId = (event.message as any)?.id;

      console.log('🟡 About to call baseCreateMessageLog');
      
      try {
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
        console.log('✅ baseCreateMessageLog completed');
      } catch (err) {
        console.error('❌ baseCreateMessageLog failed:', err);
      }
      continue;
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
      continue;
    }

    if (event.type === 'unfollow') {
      const now = Date.now();
      let rec = await baseFindByUserId(userId);

      if (rec?.record_id) {
        await baseUpdate(rec.record_id, {
          is_blocked: true,
          unsubscribed_at: now,
          last_active_date: now,
          source: 'LINE_unfollow',
        });
      } else {
        const created = await baseCreate({
          user_id: textField(userId),
          is_blocked: true,
          unsubscribed_at: now,
          day: now,
          last_active_date: now,
          source: 'LINE_unfollow',
          engagement_score: 0,
          total_interactions: 0,
        });
        if (created?.record_id) {
          rec = { record_id: created.record_id } as any;
        }
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

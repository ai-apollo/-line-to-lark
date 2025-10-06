import type { VercelRequest, VercelResponse } from '@vercel/node';

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
  const result = await resp.json();
  console.log('Create response:', result);
  if (result.code !== 0) {
    console.error('Create failed:', result);
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
          conditions: [
            { field_name: 'line_user_id', operator: 'is', value: [userId] }
          ]
        },
        page_size: 1,
      }),
    }
  );
  const j = await resp.json();
  return j?.data?.items?.[0];
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
  const result = await resp.json();
  if (result.code !== 0) {
    console.error('Update failed:', result);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const events = req.body?.events || [];
  const now = Date.now();

  for (const event of events) {
    const userId = event.source?.userId;
    if (!userId) continue;

    if (event.type === 'follow') {
      const profResp = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
        headers: { Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` },
      });
      const profile = await profResp.json().catch(() => ({}));

      await baseCreate({
        line_user_id: userId,
        display_name: profile?.displayName || '',
        profile_image_url: profile?.pictureUrl ? { link: profile.pictureUrl } : null,
        joined_at: now,
        entry_source: 'LINE_follow',
        entry_date: now,
        engagement_score: 0,
        last_active_date: now,
        total_interactions: 0,
      });
    }

    if (event.type === 'message' && event.message?.type === 'text') {
      let rec = await baseFindByUserId(userId);
      if (!rec) {
        await baseCreate({
          line_user_id: userId,
          display_name: '',
          profile_image_url: null,
          joined_at: now,
          entry_source: 'LINE_message',
          entry_date: now,
          engagement_score: 0,
          last_active_date: now,
          total_interactions: 0,
        });
        rec = await baseFindByUserId(userId);
      }

      const current = rec?.fields || {};
      const newInteractionCount = (current.total_interactions || 0) + 1;
      
      await baseUpdate(rec.record_id, {
        first_message_text: current.first_message_text || String(event.message.text),
        last_active_date: now,
        total_interactions: newInteractionCount,
        engagement_score: (current.engagement_score || 0) + 1,
      });
    }
  }

  res.status(200).end();
}

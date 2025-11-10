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
  const j: any = await resp.json();
  return j.tenant_access_token as string;
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

  const { userId, displayName, pictureUrl, source } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  try {
    const rec = await baseFindByUserId(userId);

    if (rec) {
      await baseUpdate(rec.record_id, {
        source: source || 'liff',
        name: displayName || rec.fields.name,
        profile_image_url: pictureUrl || rec.fields.profile_image_url,
        last_active_date: Date.now(),
      });
    } else {
      const now = Date.now();
      await baseCreate({
        user_id: userId,
        name: displayName || '',
        profile_image_url: pictureUrl || '',
        source: source || 'liff',
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

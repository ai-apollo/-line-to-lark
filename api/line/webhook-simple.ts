/**
 * 簡易版 LINE Webhook（最小限のフィールドでテスト用）
 *
 * 現在のBitableフィールドに合わせた実装:
 * - name (display_name)
 * - user_id (line userId)
 * - day (追加日時)
 * - source (流入経路)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

async function getLarkToken(): Promise<string> {
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
  if (!resp.ok) {
    console.error('Create Error:', await resp.text());
    return null;
  }
  const result: any = await resp.json();
  return result?.data?.records?.[0];
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

  console.log('🟢 Webhook received');

  const events = req.body?.events || [];
  for (const event of events) {
    const userId = event.source?.userId;
    if (!userId) continue;

    console.log('🟢 Processing event:', event.type, 'for user:', userId);

    if (event.type === 'follow') {
      const now = Date.now();

      let rec = await baseFindByUserId(userId);
      if (rec?.record_id) {
        // 既存ユーザーの場合は更新
        await baseUpdate(rec.record_id, {
          day: now,
        });
        console.log('✅ Updated existing user:', userId);
      } else {
        // 新規ユーザーの場合は作成
        await baseCreate({
          user_id: userId,
          name: '', // 後でプロフィールAPIから取得可能
          day: now,
          source: 'direct', // デフォルト値（LIFFで上書き可能）
        });
        console.log('✅ Created new user:', userId);
      }
      continue;
    }

    if (event.type === 'unfollow') {
      console.log('🔴 Unfollow event:', userId);
      // ブロック状態を記録する場合は、is_blockedフィールドを追加する必要あり
      continue;
    }

    if (event.type === 'message') {
      console.log('💬 Message event:', userId);
      // メッセージログの記録は別途実装
      continue;
    }
  }

  res.status(200).end();
}

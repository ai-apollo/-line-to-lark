import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

// LINE署名検証
function verifySignature(body: string, signature: string | undefined, secret: string): boolean {
  if (!signature) return false;
  const hash = crypto.createHmac('sha256', secret).update(body).digest('base64');
  return hash === signature;
}

// Larkテナントアクセストークン取得
let cachedToken: { token: string; expireAt: number } | null = null;
async function getLarkToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expireAt > now + 30_000) return cachedToken.token;
  
  const resp = await fetch('https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: process.env.LARK_APP_ID,
      app_secret: process.env.LARK_APP_SECRET
    })
  });
  const data = await resp.json();
  cachedToken = { token: data.tenant_access_token, expireAt: now + data.expire * 1000 };
  return cachedToken.token;
}

// Lark Baseに新規レコード作成
async function baseCreateRecord(fields: any) {
  const token = await getLarkToken();
  await fetch(
    `https://open.larksuite.com/open-apis/bitable/v1/apps/${process.env.LARK_APP_TOKEN}/tables/${process.env.LARK_TABLE_ID}/records/batch_create`,
    {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${token}`, 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({ records: [{ fields }] }),
    }
  );
}

// 既存レコードを検索して更新（なければ新規作成）
async function baseUpsertByUser(
  userId: string, 
  updateFn: (current: any) => any
) {
  const token = await getLarkToken();
  const searchUrl = `https://open.larksuite.com/open-apis/bitable/v1/apps/${process.env.LARK_APP_TOKEN}/tables/${process.env.LARK_TABLE_ID}/records/search`;
  
  const searchResp = await fetch(searchUrl, {
    method: 'POST',
    headers: { 
      'Authorization': `Bearer ${token}`, 
      'Content-Type': 'application/json' 
    },
    body: JSON.stringify({ 
      filter: { formula: `{line_user_id}="${userId}"` } 
    }),
  });
  
  const data = await searchResp.json();
  const record = data?.data?.items?.[0];
  const recordId = record?.record_id;
  const current = record?.fields ?? {};
  
  const newFields = updateFn(current);
  
  if (recordId) {
    // 既存レコードを更新
    await fetch(
      `https://open.larksuite.com/open-apis/bitable/v1/apps/${process.env.LARK_APP_TOKEN}/tables/${process.env.LARK_TABLE_ID}/records/${recordId}`,
      {
        method: 'PATCH',
        headers: { 
          'Authorization': `Bearer ${token}`, 
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ fields: newFields }),
      }
    );
  } else {
    // 新規レコード作成
    await baseCreateRecord({ ...newFields, line_user_id: userId });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const rawBody = JSON.stringify(req.body);
  const signature = req.headers['x-line-signature'] as string;
  
  if (!verifySignature(rawBody, signature, process.env.LINE_CHANNEL_SECRET!)) {
    return res.status(401).send('Invalid signature');
  }

  const events = req.body?.events || [];
  
  for (const event of events) {
    const userId = event.source?.userId;
    if (!userId) continue;

    // 1. 友だち追加（follow）
    if (event.type === 'follow') {
      const profileResp = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
        headers: { Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` }
      });
      const profile = await profileResp.json();
      
      await baseCreateRecord({
        line_user_id: userId,
        display_name: profile.displayName || '',
        profile_image_url: profile.pictureUrl ? { link: profile.pictureUrl } : null,
        joined_at: Date.now(),
        source: 'LINE',
        status: 'Active',
        funnel_stage: '認知',
        engagement_score: 0,
        total_interactions: 0,
        entry_date: Date.now(),
        last_active_date: Date.now()
      });
    }

    // 2. メッセージ受信（message）
    if (event.type === 'message' && event.message?.type === 'text') {
      await baseUpsertByUser(userId, (current) => ({
        first_message_text: current?.first_message_text || event.message.text,
        last_active_date: Date.now(),
        total_interactions: (current?.total_interactions || 0) + 1,
        engagement_score: (current?.engagement_score || 0) + 1
      }));
    }

    // 3. ボタン押下（postback）
    if (event.type === 'postback') {
      const params = new URLSearchParams(event.postback?.data || '');
      const interest = params.get('interest');
      const step = params.get('step');

      await baseUpsertByUser(userId, (current) => ({
        interest_tag: interest || current?.interest_tag,
        funnel_stage: step || current?.funnel_stage || '関心',
        engagement_score: (current?.engagement_score || 0) + 2,
        total_interactions: (current?.total_interactions || 0) + 1,
        last_active_date: Date.now()
      }));
    }

    // 4. ブロック（unfollow）
    if (event.type === 'unfollow') {
      await baseUpsertByUser(userId, () => ({
        status: 'Unsubscribed',
        last_active_date: Date.now()
      }));
    }
  }
  
  res.status(200).end();
}

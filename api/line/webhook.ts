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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const rawBody = JSON.stringify(req.body);
  const signature = req.headers['x-line-signature'] as string;
  
  if (!verifySignature(rawBody, signature, process.env.LINE_CHANNEL_SECRET!)) {
    return res.status(401).send('Invalid signature');
  }

  const events = req.body?.events || [];
  
  for (const event of events) {
    if (event.type === 'follow') {
      const userId = event.source.userId;
      
      // LINEプロフィール取得
      const profileResp = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
        headers: { Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` }
      });
      const profile = await profileResp.json();
      
      // Lark Baseに保存
      const token = await getLarkToken();
      await fetch(`https://open.larksuite.com/open-apis/bitable/v1/apps/${process.env.LARK_APP_TOKEN}/tables/${process.env.LARK_TABLE_ID}/records/batch_create`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          records: [{
            fields: {
              line_user_id: userId,
              display_name: profile.displayName || '',
              profile_image_url: profile.pictureUrl ? { link: profile.pictureUrl } : null,
              joined_at: Date.now()
            }
          }]
        })
      });
    }
  }
  
  res.status(200).end();
}

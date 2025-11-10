import type { VercelRequest, VercelResponse } from '@vercel/node';
import { baseCreateMessageLog } from '../lark/message-log';

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

async function sendLineMessage(userId: string, text: string) {
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;

  if (!accessToken) {
    throw new Error('LINE_CHANNEL_ACCESS_TOKEN is not set');
  }

  const resp = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      to: userId,
      messages: [
        {
          type: 'text',
          text: text,
        }
      ]
    }),
  });

  if (!resp.ok) {
    const errorText = await resp.text();
    console.error('❌ LINE API Error:', errorText);
    throw new Error(`LINE API failed: ${resp.status} ${errorText}`);
  }

  return await resp.json();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId, text } = req.body;

  if (!userId || !text) {
    return res.status(400).json({ error: 'userId and text are required' });
  }

  try {
    console.log('📤 Sending message to:', userId);
    console.log('💬 Message:', text);

    // LINEにメッセージを送信
    await sendLineMessage(userId, text);
    console.log('✅ Message sent successfully');

    // Bitableでユーザーレコードを取得
    const rec = await baseFindByUserId(userId);
    const recordId = rec?.record_id;

    // 送信メッセージをBitableに記録（direction: 'outgoing'）
    const now = Date.now();
    await baseCreateMessageLog({
      message_record_id: `${now}`,
      line_user_id: userId,
      direction: 'outgoing',
      event_type: 'message',
      message_type: 'text',
      text,
      payload: '',
      ts: new Date(now).toISOString(),
      raw_json: JSON.stringify({ sent_at: now, to: userId, text }),
      parent_user: recordId ? [recordId] : undefined,
    });

    console.log('✅ Message logged to Bitable');

    res.status(200).json({
      success: true,
      message: 'Message sent and logged',
      userId,
      text,
    });

  } catch (error: any) {
    console.error('❌ Error:', error);
    res.status(500).json({
      error: 'Failed to send message',
      details: error.message
    });
  }
}

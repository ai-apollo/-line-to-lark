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

async function getChatHistory(userId: string, limit: number = 50) {
  const token = await getLarkToken();
  const resp = await fetch(
    `https://open.larksuite.com/open-apis/bitable/v1/apps/${process.env.LARK_APP_TOKEN}/tables/${process.env.LARK_MESSAGES_TABLE_ID}/records/search`,
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
        sort: [
          {
            field_name: 'ts',
            desc: false  // 古い順（時系列）
          }
        ],
        page_size: limit,
      }),
    }
  );

  const result: any = await resp.json();
  return result.data?.items || [];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId, limit } = req.query;

  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ error: 'userId is required' });
  }

  try {
    const limitNum = limit ? parseInt(limit as string) : 50;
    const history = await getChatHistory(userId, limitNum);

    // チャット履歴を整形
    const formattedHistory = history.map((record: any) => {
      const fields = record.fields;
      return {
        record_id: record.record_id,
        timestamp: fields.ts,
        direction: fields.direction,  // 'incoming' or 'outgoing'
        event_type: fields.event_type,
        message_type: fields.message_type,
        text: fields.text || '',
        payload: fields.payload || '',
        message_id: fields.message_id || '',
      };
    });

    res.status(200).json({
      success: true,
      userId,
      count: formattedHistory.length,
      history: formattedHistory,
    });

  } catch (error: any) {
    console.error('❌ Error:', error);
    res.status(500).json({
      error: 'Failed to get chat history',
      details: error.message
    });
  }
}

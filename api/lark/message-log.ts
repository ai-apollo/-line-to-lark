export async function getLarkToken(): Promise<string> {
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

type Fields = {
  message_record_id?: string;
  line_user_id: string;
  direction: 'incoming' | 'outgoing' | 'system';
  event_type: 'message' | 'postback' | 'follow' | 'unfollow';
  message_type?: string;
  text?: string;
  payload?: string;
  ts: string;
  message_id?: string;
  raw_json?: string;
  parent_user?: string[];
};

export async function baseCreateMessageLog(fields: Fields) {
  const token = await getLarkToken();
  const appToken = process.env.LARK_APP_TOKEN;
  const tableId = process.env.LARK_MESSAGES_TABLE_ID;

  if (!token || !appToken || !tableId) {
    console.error('Lark env missing. Check LARK_APP_TOKEN / LARK_MESSAGES_TABLE_ID / token');
    return;
  }

  const url = `https://open.larksuite.com/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/batch_create`;
  const body = { records: [{ fields }] };

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const t = await resp.text();
    console.error('Create Message Log Error:', t);
  }
}

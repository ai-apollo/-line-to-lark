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
  const j: any = await resp.json();
  return j.tenant_access_token as string;
}

type Fields = {
  message_record_id?: string;
  user_id?: string;  // Changed from line_user_id to match table
  direction?: string;
  event_type?: string;
  message_type?: string;
  text?: string;
  payload?: string;
  ts?: number;  // UNIXタイムスタンプ（ミリ秒）
  message_id?: string;
  raw_json?: string;
  parent_user?: string[];
  from_name?: string;    // ルックアップ代替：親の name を写し取り
  from_source?: string;  // ルックアップ代替：親の source を写し取り
};

export async function baseCreateMessageLog(fields: Fields) {
  console.log('🔵 baseCreateMessageLog called with:', JSON.stringify(fields));

  const token = await getLarkToken();
  const appToken = process.env.LARK_APP_TOKEN;
  const tableId = process.env.LARK_MESSAGES_TABLE_ID;

  // 追加: デバッグログ
  console.log('[MessageLog] app=', appToken, 'table=', tableId);

  console.log('🔵 Env check:', {
    hasToken: !!token,
    hasAppToken: !!appToken,
    tableId: tableId
  });

  if (!token || !appToken || !tableId) {
    console.error('❌ Lark env missing');
    return;
  }

  const url = `https://open.larksuite.com/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/batch_create`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ records: [{ fields }] }),
  });

  const text = await resp.text();
  try {
    const json = JSON.parse(text);
    if (json.code === 0) {
      const ids = json.data?.records?.map((r: any) => r.record_id);
      console.log('✅ Message log created successfully', { record_ids: ids });
    } else {
      console.error('❌ Create Message Log Error', json);
    }
  } catch {
    console.error('❌ Create Message Log Non-JSON', { status: resp.status, body: text });
  }
}

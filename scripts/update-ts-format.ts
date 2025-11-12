import * as dotenv from 'dotenv';
dotenv.config();

async function getTenantToken() {
  const r = await fetch('https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: process.env.LARK_APP_ID, app_secret: process.env.LARK_APP_SECRET }),
  });
  const j: any = await r.json();
  if (!j?.tenant_access_token) throw new Error('getTenantToken failed: ' + JSON.stringify(j));
  return j.tenant_access_token as string;
}

async function lark(path: string, token: string, init: RequestInit = {}) {
  const r = await fetch('https://open.larksuite.com' + path, {
    ...init,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Authorization': `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
  const j: any = await r.json();
  if (j.code && j.code !== 0) throw new Error(`${path} failed: ${JSON.stringify(j)}`);
  return j;
}

(async () => {
  const app = process.env.LARK_APP_TOKEN!;
  const table = process.env.LARK_MESSAGES_TABLE_ID!;

  const token = await getTenantToken();

  // Get all fields
  const fieldsRes = await lark(`/open-apis/bitable/v1/apps/${app}/tables/${table}/fields?page_size=500`, token);
  const fields = fieldsRes?.data?.items || [];

  // Find ts field
  const tsField = fields.find((f: any) => f.field_name === 'ts');

  if (!tsField) {
    console.error('❌ ts field not found!');
    return;
  }

  console.log('📅 Current ts field:', {
    field_id: tsField.field_id,
    type: tsField.type,
    property: tsField.property,
  });

  // Update ts field to show seconds
  // Date field has separate date_formatter and time_formatter
  const updatePayload = {
    field_name: 'ts',
    type: 5, // Date type
    property: {
      auto_fill: false,
      date_formatter: 'yyyy/MM/dd',
      time_formatter: 'HH:mm:ss', // 秒まで表示
    },
  };

  console.log('\n📝 Updating ts field format to include seconds...');

  await lark(`/open-apis/bitable/v1/apps/${app}/tables/${table}/fields/${tsField.field_id}`, token, {
    method: 'PUT',
    body: JSON.stringify(updatePayload),
  });

  console.log('✅ ts field updated to show seconds!');
  console.log('   Format: yyyy/MM/dd HH:mm:ss');
})().catch(e => {
  console.error('❌ Failed:', e);
  process.exit(1);
});

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

  // Get all fields to find ts field ID
  const fieldsRes = await lark(`/open-apis/bitable/v1/apps/${app}/tables/${table}/fields?page_size=500`, token);
  const fields = fieldsRes?.data?.items || [];

  const tsField = fields.find((f: any) => f.field_name === 'ts');
  if (!tsField) {
    console.error('❌ ts field not found!');
    return;
  }

  console.log('✅ ts field found:', tsField.field_id);

  // Create ts_readable field with formula to show seconds
  // TEXT(timestamp, "YYYY/MM/DD HH:mm:ss")
  const formula = `TEXT({ts}, "yyyy/MM/dd HH:mm:ss")`;

  console.log('📝 Creating ts_readable field with formula:', formula);

  await lark(`/open-apis/bitable/v1/apps/${app}/tables/${table}/fields`, token, {
    method: 'POST',
    body: JSON.stringify({
      field_name: 'ts_readable',
      type: 20, // Formula type
      property: {
        formula: formula,
      },
    }),
  });

  console.log('✅ ts_readable field created!');
  console.log('   This field will show: 2025/11/12 19:45:32');
})().catch(e => {
  console.error('❌ Failed:', e.message);
  console.log('\n💡 Fallback: Manually update ts field in UI');
  console.log('   1. Click ts column header');
  console.log('   2. Edit field settings');
  console.log('   3. Set time format to "HH:mm:ss"');
  process.exit(1);
});

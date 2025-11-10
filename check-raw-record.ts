import * as dotenv from 'dotenv';
dotenv.config();

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
  return j.tenant_access_token;
}

async function getRecord(recordId: string) {
  const token = await getLarkToken();
  const resp = await fetch(
    `https://open.larksuite.com/open-apis/bitable/v1/apps/${process.env.LARK_APP_TOKEN}/tables/${process.env.LARK_TABLE_ID}/records/${recordId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const result: any = await resp.json();
  return result.data?.record;
}

async function main() {
  // 最新のレコードID
  const recordId = 'recv21huErj7Jz';

  console.log('🔍 Fetching raw record data...\n');
  const record = await getRecord(recordId);

  console.log('📊 Raw record data:');
  console.log(JSON.stringify(record, null, 2));

  console.log('\n📋 Field details:');
  console.log('user_id:', record.fields.user_id);
  console.log('user_id type:', typeof record.fields.user_id);
  console.log('user_id value:', JSON.stringify(record.fields.user_id));
}

main().catch(console.error);

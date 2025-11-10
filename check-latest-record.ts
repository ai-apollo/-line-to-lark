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

async function getLatestRecord() {
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
        sort: [
          {
            field_name: 'last_active_date',
            desc: true
          }
        ],
        page_size: 1,
      }),
    }
  );

  const result: any = await resp.json();
  return result.data?.items?.[0];
}

async function main() {
  console.log('🔍 Fetching latest record (by last_active_date)...\n');

  const record = await getLatestRecord();

  if (!record) {
    console.log('❌ No record found');
    return;
  }

  console.log('📊 Latest Record:');
  console.log('Record ID:', record.record_id);
  console.log('\n📋 All Fields:');
  console.log(JSON.stringify(record.fields, null, 2));

  console.log('\n🔍 Key Fields:');
  console.log('user_id:', record.fields.user_id || '(empty)');
  console.log('name:', record.fields.name || '(empty)');
  console.log('profile_image:', record.fields.profile_image || '(empty)');
  console.log('status_message:', record.fields.status_message || '(empty)');
  console.log('source:', record.fields.source || '(empty)');
  console.log('last_active_date:', record.fields.last_active_date
    ? new Date(record.fields.last_active_date).toLocaleString('ja-JP')
    : '(empty)');
}

main().catch(console.error);

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

async function findLatestRecord() {
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
            field_name: 'joined_at',
            desc: true
          }
        ],
        page_size: 5,
      }),
    }
  );

  const result: any = await resp.json();
  return result.data?.items || [];
}

async function main() {
  console.log('🔍 Checking latest records in Bitable...\n');

  const records = await findLatestRecord();

  if (records.length === 0) {
    console.log('❌ No records found');
    return;
  }

  console.log(`📊 Found ${records.length} records:\n`);

  records.forEach((record: any, index: number) => {
    const fields = record.fields;
    console.log(`${index + 1}. Record ID: ${record.record_id}`);
    console.log(`   user_id: ${fields.user_id || '(empty)'}`);
    console.log(`   name: ${fields.name || '(empty)'}`);
    console.log(`   source: ${fields.source || '(empty)'}`);
    console.log(`   day: ${fields.day ? new Date(fields.day).toLocaleString('ja-JP') : '(empty)'}`);
    console.log(`   joined_at: ${fields.joined_at ? new Date(fields.joined_at).toLocaleString('ja-JP') : '(empty)'}`);
    console.log(`   engagement_score: ${fields.engagement_score ?? '(empty)'}`);
    console.log(`   total_interactions: ${fields.total_interactions ?? '(empty)'}`);
    console.log(`   last_active_date: ${fields.last_active_date ? new Date(fields.last_active_date).toLocaleString('ja-JP') : '(empty)'}`);
    console.log(`   is_blocked: ${fields.is_blocked ?? '(empty)'}`);
    console.log(`   first_message_text: ${fields.first_message_text || '(empty)'}`);
    console.log('');
  });
}

main().catch(console.error);

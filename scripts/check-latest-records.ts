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

async function getLatestRecords() {
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
            field_name: 'day',
            desc: true,
          }
        ],
        page_size: 10,
      }),
    }
  );

  if (!resp.ok) {
    console.error('❌ Error:', await resp.text());
    return;
  }

  const result: any = await resp.json();
  const records = result.data?.items || [];

  console.log('\n📊 Latest 10 Records:\n');
  console.log('─'.repeat(120));

  records.forEach((rec: any, index: number) => {
    const fields = rec.fields;
    console.log(`\n[${index + 1}] Record ID: ${rec.record_id}`);
    console.log(`    user_id: ${fields.user_id || '❌ EMPTY'}`);
    console.log(`    name: ${fields.name || '❌ EMPTY'}`);
    console.log(`    source: ${fields.source || '❌ EMPTY'}`);
    console.log(`    profile_image_url: ${fields.profile_image_url || '❌ EMPTY'}`);
    console.log(`    status_message: ${fields.status_message || '(none)'}`);
    console.log(`    joined_at: ${fields.joined_at ? new Date(fields.joined_at).toISOString() : '❌ EMPTY'}`);
    console.log(`    engagement_score: ${fields.engagement_score ?? '❌ EMPTY'}`);
    console.log(`    total_interactions: ${fields.total_interactions ?? '❌ EMPTY'}`);
    console.log(`    is_blocked: ${fields.is_blocked ?? 'false'}`);
  });

  console.log('\n' + '─'.repeat(120));
}

getLatestRecords().catch(console.error);

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
            field_name: 'day',
            desc: true,
          }
        ],
        page_size: 1,
      }),
    }
  );

  if (!resp.ok) {
    console.error('❌ Error:', await resp.text());
    return;
  }

  const result: any = await resp.json();

  console.log('\n📄 Latest Record (Raw JSON):\n');
  console.log(JSON.stringify(result.data?.items?.[0], null, 2));
}

getLatestRecord().catch(console.error);

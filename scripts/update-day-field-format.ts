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

async function getTableFields() {
  const token = await getLarkToken();
  const resp = await fetch(
    `https://open.larksuite.com/open-apis/bitable/v1/apps/${process.env.LARK_APP_TOKEN}/tables/${process.env.LARK_TABLE_ID}/fields`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  const result: any = await resp.json();
  return result.data?.items || [];
}

async function updateDayFieldFormat() {
  const token = await getLarkToken();
  const fields = await getTableFields();
  const dayField = fields.find((f: any) => f.field_name === 'day');

  if (!dayField) {
    console.error('❌ day field not found');
    return;
  }

  console.log('📋 Current day field format:', dayField.property.date_formatter);

  const resp = await fetch(
    `https://open.larksuite.com/open-apis/bitable/v1/apps/${process.env.LARK_APP_TOKEN}/tables/${process.env.LARK_TABLE_ID}/fields/${dayField.field_id}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        field_name: 'day',
        type: 5, // Date type
        property: {
          auto_fill: false,
          date_formatter: 'yyyy/MM/dd HH:mm', // Add time to format
        },
      }),
    }
  );

  if (!resp.ok) {
    console.error('❌ Failed to update field:', await resp.text());
  } else {
    const result: any = await resp.json();
    console.log('✅ Updated day field format to:', result.data?.field?.property?.date_formatter);
  }
}

updateDayFieldFormat().catch(console.error);

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

async function main() {
  console.log('🔍 Checking field types...\n');

  const fields = await getTableFields();

  // Field type mapping
  const typeNames: Record<number, string> = {
    1: 'Text',
    2: 'Number',
    3: 'Single Select',
    4: 'Multi Select',
    5: 'Date',
    7: 'Checkbox',
    11: 'Person',
    13: 'Phone',
    15: 'URL',
    17: 'Attachment',
    18: 'Single Link',
    19: 'Formula',
    20: 'Dual Link',
    21: 'Location',
    22: 'Group',
    1001: 'Created Time',
    1002: 'Modified Time',
    1003: 'Created By',
    1004: 'Modified By',
  };

  console.log('📊 Current field structure:\n');
  fields.forEach((field: any) => {
    console.log(`• ${field.field_name}`);
    console.log(`  ID: ${field.field_id}`);
    console.log(`  Type: ${field.type} (${typeNames[field.type] || 'Unknown'})`);
    if (field.property) {
      console.log(`  Property:`, JSON.stringify(field.property, null, 2));
    }
    console.log('');
  });
}

main().catch(console.error);

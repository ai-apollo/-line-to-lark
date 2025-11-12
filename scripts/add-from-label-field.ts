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

async function getFields(token: string, appToken: string, tableId: string) {
  const resp = await fetch(
    `https://open.larksuite.com/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/fields`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  const result: any = await resp.json();
  return result.data?.items || [];
}

async function createFormulaField(
  token: string,
  appToken: string,
  tableId: string,
  fieldName: string,
  formula: string
) {
  console.log(`📝 Creating formula field: ${fieldName}...`);

  const resp = await fetch(
    `https://open.larksuite.com/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/fields`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        field_name: fieldName,
        type: 20, // Formula type
        property: {
          formula: formula,
        },
      }),
    }
  );

  const text = await resp.text();
  try {
    const result: any = JSON.parse(text);
    if (result.code === 0) {
      console.log(`✅ ${fieldName} created successfully!`);
      return true;
    } else {
      console.error(`❌ Failed to create ${fieldName}:`, result.msg || result);
      return false;
    }
  } catch {
    console.error(`❌ Failed to parse response for ${fieldName}:`, text);
    return false;
  }
}

async function addFromLabelField() {
  console.log('🔧 Adding from_label formula field...\n');

  const token = await getLarkToken();
  const appToken = process.env.LARK_APP_TOKEN!;
  const tableId = process.env.LARK_MESSAGES_TABLE_ID!;

  console.log('App Token:', appToken);
  console.log('Table ID:', tableId);
  console.log('');

  // Check if from_label already exists
  const fields = await getFields(token, appToken, tableId);
  const exists = fields.some((f: any) => f.field_name === 'from_label');

  if (exists) {
    console.log('✅ from_label already exists');
    return;
  }

  // Create from_label formula: CONCATENATE({from_name}, "（", {from_source}, "）")
  const formula = 'CONCATENATE({from_name}, "（", {from_source}, "）")';
  await createFormulaField(token, appToken, tableId, 'from_label', formula);

  console.log('\n✅ from_label field created!');
  console.log('\n📋 Next steps:');
  console.log('1. Open the table in Lark Bitable UI');
  console.log('2. Drag "from_label" field to the leftmost position');
  console.log('3. Optionally hide "from_name" and "from_source" columns');
  console.log('4. The table will now show "誰から" at the first column!');
  console.log('\nTable URL: https://tjpunq0typwo.jp.larksuite.com/base/Vssgb39WFa9iEXs9WSPj6TZ8pKh?table=' + tableId);
}

addFromLabelField().catch(console.error);

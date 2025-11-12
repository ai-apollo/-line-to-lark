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

async function createField(
  token: string,
  appToken: string,
  tableId: string,
  fieldName: string,
  fieldType: number
) {
  console.log(`📌 Creating field: ${fieldName}...`);

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
        type: fieldType,
      }),
    }
  );

  const text = await resp.text();
  try {
    const result: any = JSON.parse(text);
    if (result.code === 0) {
      console.log(`✅ ${fieldName} created`);
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

async function addFromFields() {
  console.log('🔧 Adding from_name and from_source fields...\n');

  const token = await getLarkToken();
  const appToken = process.env.LARK_APP_TOKEN!;
  const tableId = process.env.LARK_MESSAGES_TABLE_ID!;

  console.log('App Token:', appToken);
  console.log('Table ID:', tableId);
  console.log('');

  // Create from_name (Text)
  await createField(token, appToken, tableId, 'from_name', 1);
  await new Promise(resolve => setTimeout(resolve, 500));

  // Create from_source (Text)
  await createField(token, appToken, tableId, 'from_source', 1);

  console.log('\n✅ from_name and from_source fields added!');
}

addFromFields().catch(console.error);

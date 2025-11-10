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

async function deleteField(fieldId: string) {
  const token = await getLarkToken();
  const resp = await fetch(
    `https://open.larksuite.com/open-apis/bitable/v1/apps/${process.env.LARK_APP_TOKEN}/tables/${process.env.LARK_TABLE_ID}/fields/${fieldId}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!resp.ok) {
    console.error(`❌ Failed to delete field:`, await resp.text());
  } else {
    console.log(`✅ Deleted field: ${fieldId}`);
  }
}

async function createTextField(fieldName: string) {
  const token = await getLarkToken();

  const resp = await fetch(
    `https://open.larksuite.com/open-apis/bitable/v1/apps/${process.env.LARK_APP_TOKEN}/tables/${process.env.LARK_TABLE_ID}/fields`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        field_name: fieldName,
        type: 1, // Text type
      }),
    }
  );

  if (!resp.ok) {
    console.error(`❌ Failed to create field:`, await resp.text());
  } else {
    const result: any = await resp.json();
    console.log(`✅ Created text field: ${fieldName} (ID: ${result.data?.field?.field_id})`);
  }
}

async function main() {
  console.log('🔧 Fixing profile_image_url field...\n');

  // 既存フィールドを取得
  const fields = await getTableFields();
  const profileUrlField = fields.find((f: any) => f.field_name === 'profile_image_url');

  if (profileUrlField) {
    console.log(`📋 Found existing profile_image_url field (Type: ${profileUrlField.type})`);
    console.log('🗑️  Deleting old field...');
    await deleteField(profileUrlField.field_id);
    console.log('');
  }

  console.log('➕ Creating new profile_image_url field (Text type)...');
  await createTextField('profile_image_url');

  console.log('\n✅ Done! Now profile_image_url is a Text field.');
}

main().catch(console.error);

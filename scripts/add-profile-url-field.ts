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

async function createField(fieldName: string, fieldType: number) {
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
        type: fieldType,
      }),
    }
  );

  if (!resp.ok) {
    console.error(`❌ Failed to create field ${fieldName}:`, await resp.text());
  } else {
    const result: any = await resp.json();
    console.log(`✅ Created field: ${fieldName} (ID: ${result.data?.field?.field_id})`);
  }
}

async function main() {
  console.log('➕ Adding profile_image_url field...\n');

  // Type 1 = Text
  // Type 15 = URL
  await createField('profile_image_url', 15);

  console.log('\n✅ Done! Now profile images will be saved as URLs.');
}

main().catch(console.error);

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

async function getSourceField() {
  const token = await getLarkToken();
  const resp = await fetch(
    `https://open.larksuite.com/open-apis/bitable/v1/apps/${process.env.LARK_APP_TOKEN}/tables/${process.env.LARK_TABLE_ID}/fields`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  const result: any = await resp.json();
  const fields = result.data?.items || [];
  return fields.find((f: any) => f.field_name === 'source');
}

async function main() {
  console.log('📋 Table ID:', process.env.LARK_TABLE_ID);
  console.log('📋 App Token:', process.env.LARK_APP_TOKEN);
  console.log('');

  const sourceField = await getSourceField();

  if (!sourceField) {
    console.error('❌ source field not found');
    return;
  }

  console.log('✅ Source field options:\n');

  const optionsMap: Record<string, string> = {};

  sourceField.property.options.forEach((opt: any) => {
    console.log(`  '${opt.name}': '${opt.id}',`);
    optionsMap[opt.name] = opt.id;
  });

  console.log('\n📝 Copy this to SOURCE_OPTIONS:');
  console.log('\nconst SOURCE_OPTIONS: Record<string, string> = {');
  Object.entries(optionsMap).forEach(([name, id]) => {
    console.log(`  '${name}': '${id}',`);
  });
  console.log('};');
}

main().catch(console.error);

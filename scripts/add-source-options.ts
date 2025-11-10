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

async function addSourceOptions() {
  const token = await getLarkToken();
  const sourceField = await getSourceField();

  if (!sourceField) {
    console.error('❌ source field not found');
    return;
  }

  console.log('📋 Current source options:');
  sourceField.property.options.forEach((opt: any) => {
    console.log(`  - ${opt.name} (ID: ${opt.id})`);
  });

  // Add new options: liff, note, X, LP, ads
  const newOptions = ['liff', 'note', 'X', 'LP', 'ads'];
  const existingNames = sourceField.property.options.map((o: any) => o.name);
  const toAdd = newOptions.filter(name => !existingNames.includes(name));

  if (toAdd.length === 0) {
    console.log('\n✅ All options already exist');
    return;
  }

  console.log(`\n➕ Adding new options: ${toAdd.join(', ')}`);

  // Update field with new options
  const updatedOptions = [
    ...sourceField.property.options,
    ...toAdd.map((name, index) => ({
      name,
      color: (sourceField.property.options.length + index) % 10,
    }))
  ];

  const resp = await fetch(
    `https://open.larksuite.com/open-apis/bitable/v1/apps/${process.env.LARK_APP_TOKEN}/tables/${process.env.LARK_TABLE_ID}/fields/${sourceField.field_id}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        field_name: 'source',
        type: 3,
        property: {
          options: updatedOptions,
        },
      }),
    }
  );

  if (!resp.ok) {
    console.error('❌ Failed to update field:', await resp.text());
  } else {
    const result: any = await resp.json();
    console.log('\n✅ Updated source field successfully');
    console.log('\n📋 New options:');
    result.data?.field?.property?.options?.forEach((opt: any) => {
      console.log(`  - ${opt.name} (ID: ${opt.id})`);
    });
  }
}

addSourceOptions().catch(console.error);

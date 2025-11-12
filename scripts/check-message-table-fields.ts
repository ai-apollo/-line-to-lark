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

async function checkMessageTableFields() {
  console.log('🔍 Checking Message Table Fields...\n');

  const token = await getLarkToken();
  const appToken = process.env.LARK_APP_TOKEN;
  const tableId = process.env.LARK_MESSAGES_TABLE_ID;

  console.log('App Token:', appToken);
  console.log('Table ID:', tableId);
  console.log('');

  const resp = await fetch(
    `https://open.larksuite.com/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/fields`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  const result: any = await resp.json();

  if (result.code !== 0) {
    console.error('❌ Failed to get fields:', result);
    return;
  }

  const fields = result.data?.items || [];

  console.log('📊 Message Table Fields:\n');
  console.log('─'.repeat(100));

  const expectedFields = [
    'message_record_id',
    'line_user_id',
    'direction',
    'event_type',
    'message_type',
    'text',
    'payload',
    'ts',
    'message_id',
    'raw_json',
    'parent_user',
  ];

  console.log('Expected fields from code:');
  expectedFields.forEach(name => console.log(`  - ${name}`));
  console.log('');

  console.log('Actual fields in table:');
  fields.forEach((field: any, index: number) => {
    const typeNames: Record<number, string> = {
      1: 'Text',
      2: 'Number',
      3: 'Single Select',
      4: 'Multiple Select',
      5: 'Date',
      7: 'Checkbox',
      11: 'Person',
      15: 'URL',
      17: 'Attachment',
      18: 'Relation',
      20: 'Formula',
      21: 'Lookup',
      1005: 'Auto Number',
    };

    const typeName = typeNames[field.type] || `Unknown(${field.type})`;
    console.log(`  [${index + 1}] ${field.field_name} (${typeName})`);

    if (field.type === 3) {
      // Single Select
      const options = field.property?.options || [];
      if (options.length > 0) {
        console.log(`      Options: ${options.map((o: any) => o.name).join(', ')}`);
      }
    }
  });

  console.log('\n' + '─'.repeat(100));

  // Check for missing fields
  console.log('\n📋 Field Mapping Check:\n');

  expectedFields.forEach(expectedName => {
    const found = fields.find((f: any) => f.field_name === expectedName);
    if (found) {
      console.log(`✅ ${expectedName} - Found`);
    } else {
      console.log(`❌ ${expectedName} - NOT FOUND`);
      // Try to find similar names
      const similar = fields.filter((f: any) =>
        f.field_name.toLowerCase().includes(expectedName.toLowerCase()) ||
        expectedName.toLowerCase().includes(f.field_name.toLowerCase())
      );
      if (similar.length > 0) {
        console.log(`   Similar: ${similar.map((f: any) => f.field_name).join(', ')}`);
      }
    }
  });

  console.log('');
}

checkMessageTableFields().catch(console.error);

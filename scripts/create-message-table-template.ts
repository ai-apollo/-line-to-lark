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

async function createTable(token: string, appToken: string, tableName: string) {
  console.log(`📝 Creating table: ${tableName}...`);

  const resp = await fetch(
    `https://open.larksuite.com/open-apis/bitable/v1/apps/${appToken}/tables`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        table: {
          name: tableName,
          default_view_name: 'Grid View',
          fields: [
            {
              field_name: 'text',
              type: 1, // Text
            },
          ],
        },
      }),
    }
  );

  const result: any = await resp.json();

  if (result.code === 0) {
    console.log(`✅ Table created: ${result.data.table_id}`);
    return result.data.table_id;
  } else {
    console.error(`❌ Failed to create table:`, result);
    return null;
  }
}

async function createField(
  token: string,
  appToken: string,
  tableId: string,
  fieldName: string,
  fieldType: number,
  property?: any
) {
  console.log(`  📌 Creating field: ${fieldName}...`);

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
        property,
      }),
    }
  );

  const text = await resp.text();
  try {
    const result: any = JSON.parse(text);
    if (result.code === 0) {
      console.log(`  ✅ ${fieldName} created (ID: ${result.data.field.field_id})`);
      return result.data.field.field_id;
    } else {
      console.error(`  ❌ Failed to create ${fieldName}:`, result.msg || result);
      return null;
    }
  } catch {
    console.error(`  ❌ Failed to parse response for ${fieldName}:`, text);
    return null;
  }
}

async function createMessageTableTemplate() {
  console.log('🔧 Creating Message Table from template...\n');

  const token = await getLarkToken();
  const appToken = process.env.LARK_APP_TOKEN!;
  const friendsTableId = process.env.LARK_TABLE_ID!;

  console.log('App Token:', appToken);
  console.log('Friends Table ID:', friendsTableId);
  console.log('');

  // Step 1: Create table
  const tableId = await createTable(token, appToken, '会話履歴（LINE）');

  if (!tableId) {
    console.error('Failed to create table');
    return;
  }

  console.log('\n📋 Adding fields...\n');

  // Step 2: Create basic fields
  await createField(token, appToken, tableId, 'user_id', 1); // Text
  await new Promise(resolve => setTimeout(resolve, 500));

  await createField(token, appToken, tableId, 'message_record_id', 1); // Text
  await new Promise(resolve => setTimeout(resolve, 500));

  await createField(token, appToken, tableId, 'direction', 3, { // Single Select
    options: [
      { name: 'incoming' },
      { name: 'outgoing' },
      { name: 'system' },
    ],
  });
  await new Promise(resolve => setTimeout(resolve, 500));

  await createField(token, appToken, tableId, 'event_type', 3, { // Single Select
    options: [
      { name: 'message' },
      { name: 'follow' },
      { name: 'unfollow' },
      { name: 'postback' },
    ],
  });
  await new Promise(resolve => setTimeout(resolve, 500));

  await createField(token, appToken, tableId, 'message_type', 3, { // Single Select
    options: [
      { name: 'text' },
      { name: 'system' },
      { name: 'postback' },
    ],
  });
  await new Promise(resolve => setTimeout(resolve, 500));

  await createField(token, appToken, tableId, 'payload', 1); // Text
  await new Promise(resolve => setTimeout(resolve, 500));

  await createField(token, appToken, tableId, 'ts', 5); // Date
  await new Promise(resolve => setTimeout(resolve, 500));

  await createField(token, appToken, tableId, 'message_id', 1); // Text
  await new Promise(resolve => setTimeout(resolve, 500));

  await createField(token, appToken, tableId, 'raw_json', 1); // Text
  await new Promise(resolve => setTimeout(resolve, 500));

  // Step 3: Create relation field to Friends table
  console.log('\n🔗 Creating relation to Friends table...\n');

  const parentUserFieldId = await createField(token, appToken, tableId, 'parent_user', 18, { // Relation
    table_id: friendsTableId,
    multiple: false,
  });
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Step 4: Create lookup fields
  if (parentUserFieldId) {
    console.log('\n👀 Creating lookup fields...\n');

    // Get Friends table fields to get name and source field IDs
    const friendsFieldsResp = await fetch(
      `https://open.larksuite.com/open-apis/bitable/v1/apps/${appToken}/tables/${friendsTableId}/fields`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const friendsFieldsResult: any = await friendsFieldsResp.json();
    const friendsFields = friendsFieldsResult.data?.items || [];

    const nameField = friendsFields.find((f: any) => f.field_name === 'name');
    const sourceField = friendsFields.find((f: any) => f.field_name === 'source');

    if (nameField && sourceField) {
      console.log('  Found Friends fields:');
      console.log('    name:', nameField.field_id);
      console.log('    source:', sourceField.field_id);
      console.log('');

      // Create from_name lookup
      await createField(token, appToken, tableId, 'from_name', 21, { // Lookup
        link_field_id: parentUserFieldId,
        lookup_field_id: nameField.field_id,
      });
      await new Promise(resolve => setTimeout(resolve, 500));

      // Create from_source lookup
      await createField(token, appToken, tableId, 'from_source', 21, { // Lookup
        link_field_id: parentUserFieldId,
        lookup_field_id: sourceField.field_id,
      });
    } else {
      console.error('  ❌ Could not find name/source fields in Friends table');
    }
  }

  console.log('\n✅ Message Table template created successfully!');
  console.log('\n📋 Next steps:');
  console.log(`1. Update .env with new table ID: LARK_MESSAGES_TABLE_ID=${tableId}`);
  console.log('2. Verify table in Bitable UI');
  console.log('3. (Optional) Add formula field "from_label": CONCATENATE({from_name}, "（", {from_source}, "）")');
  console.log('4. Test by sending a LINE message');
}

createMessageTableTemplate().catch(console.error);

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

async function createLookupField(
  token: string,
  appToken: string,
  tableId: string,
  fieldName: string,
  linkFieldId: string,
  lookupFieldId: string
) {
  console.log(`📝 Creating lookup field: ${fieldName}...`);

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
        type: 21, // Lookup type
        property: {
          link_field_id: linkFieldId,
          lookup_field_id: lookupFieldId,
        },
      }),
    }
  );

  const text = await resp.text();
  try {
    const result: any = JSON.parse(text);
    if (result.code === 0) {
      console.log(`✅ ${fieldName} created successfully`);
      return true;
    } else {
      console.error(`❌ Failed to create ${fieldName}:`, result.msg);
      return false;
    }
  } catch {
    console.error(`❌ Failed to parse response for ${fieldName}:`, text);
    return false;
  }
}

async function addLookupFields() {
  console.log('🔧 Adding lookup fields to Message Log table...\n');

  const token = await getLarkToken();
  const appToken = process.env.LARK_APP_TOKEN!;
  const messageTableId = process.env.LARK_MESSAGES_TABLE_ID!;
  const friendsTableId = process.env.LARK_TABLE_ID!;

  console.log('App Token:', appToken);
  console.log('Message Table ID:', messageTableId);
  console.log('Friends Table ID:', friendsTableId);
  console.log('');

  // Get fields from message table
  const messageFields = await getFields(token, appToken, messageTableId);
  const parentUserField = messageFields.find((f: any) => f.field_name === 'parent_user');

  if (!parentUserField) {
    console.error('❌ parent_user field not found in message table!');
    return;
  }

  console.log('✅ parent_user field found:', parentUserField.field_id);

  // Get fields from friends table
  const friendsFields = await getFields(token, appToken, friendsTableId);
  const nameField = friendsFields.find((f: any) => f.field_name === 'name');
  const sourceField = friendsFields.find((f: any) => f.field_name === 'source');

  if (!nameField || !sourceField) {
    console.error('❌ name or source field not found in friends table!');
    console.log('Available fields:', friendsFields.map((f: any) => f.field_name).join(', '));
    return;
  }

  console.log('✅ name field found:', nameField.field_id);
  console.log('✅ source field found:', sourceField.field_id);
  console.log('');

  // Check if lookup fields already exist
  const fromNameExists = messageFields.some((f: any) => f.field_name === 'from_name');
  const fromSourceExists = messageFields.some((f: any) => f.field_name === 'from_source');

  // Create from_name lookup
  if (!fromNameExists) {
    await createLookupField(
      token,
      appToken,
      messageTableId,
      'from_name',
      parentUserField.field_id,
      nameField.field_id
    );
    await new Promise(resolve => setTimeout(resolve, 500)); // Rate limiting
  } else {
    console.log('✅ from_name already exists');
  }

  // Create from_source lookup
  if (!fromSourceExists) {
    await createLookupField(
      token,
      appToken,
      messageTableId,
      'from_source',
      parentUserField.field_id,
      sourceField.field_id
    );
  } else {
    console.log('✅ from_source already exists');
  }

  console.log('\n✅ Lookup fields setup complete!');
  console.log('');
  console.log('💡 次のステップ:');
  console.log('1. Bitableで会話履歴テーブルを開く');
  console.log('2. from_name と from_source が追加されていることを確認');
  console.log('3. 表示列を text / direction / from_name / from_source / ts に並べ替え');
  console.log('4. （オプション）from_label という数式フィールドを追加:');
  console.log('   CONCATENATE({from_name}, "（", {from_source}, "）")');
}

addLookupFields().catch(console.error);

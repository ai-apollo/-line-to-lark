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
  fieldType: number,
  property?: any
) {
  console.log(`📝 Creating field: ${fieldName}...`);

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

  const result: any = await resp.json();

  if (result.code === 0) {
    console.log(`✅ ${fieldName} created successfully`);
    return result.data.field;
  } else {
    console.error(`❌ Failed to create ${fieldName}:`, result.msg);
    return null;
  }
}

async function updateField(
  token: string,
  appToken: string,
  tableId: string,
  fieldId: string,
  fieldName: string,
  property?: any
) {
  console.log(`📝 Updating field: ${fieldName}...`);

  const body: any = { field_name: fieldName };
  if (property) {
    body.property = property;
  }

  const resp = await fetch(
    `https://open.larksuite.com/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/fields/${fieldId}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );

  const text = await resp.text();
  try {
    const result: any = JSON.parse(text);
    if (result.code === 0) {
      console.log(`✅ ${fieldName} updated successfully`);
      return true;
    } else {
      console.error(`❌ Failed to update ${fieldName}:`, result.msg);
      return false;
    }
  } catch (error) {
    console.error(`❌ Failed to parse response for ${fieldName}:`, text);
    return false;
  }
}

async function getExistingFields(token: string, appToken: string, tableId: string) {
  const resp = await fetch(
    `https://open.larksuite.com/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/fields`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  const result: any = await resp.json();
  return result.data?.items || [];
}

async function setupMessageTableFields() {
  console.log('🔧 Setting up Message Table Fields...\n');

  const token = await getLarkToken();
  const appToken = process.env.LARK_APP_TOKEN!;
  const tableId = process.env.LARK_MESSAGES_TABLE_ID!;
  const friendsTableId = process.env.LARK_TABLE_ID!;

  console.log('App Token:', appToken);
  console.log('Message Table ID:', tableId);
  console.log('Friends Table ID:', friendsTableId);
  console.log('');

  // Get existing fields
  const existingFields = await getExistingFields(token, appToken, tableId);
  const fieldMap = new Map(existingFields.map((f: any) => [f.field_name, f]));

  console.log('📊 Existing fields:', existingFields.map((f: any) => f.field_name).join(', '));
  console.log('');

  // 1. Rename user_id to line_user_id (if exists)
  const userIdField: any = fieldMap.get('user_id');
  if (userIdField) {
    await updateField(token, appToken, tableId, userIdField.field_id, 'line_user_id');
  } else if (!fieldMap.has('line_user_id')) {
    // Create line_user_id if it doesn't exist
    await createField(token, appToken, tableId, 'line_user_id', 1); // Type 1 = Text
  }

  // 2. Update direction options (add incoming, outgoing)
  const directionField: any = fieldMap.get('direction');
  if (directionField && directionField.type === 3) {
    // Single Select
    const existingOptions = directionField.property?.options || [];
    const existingNames = existingOptions.map((o: any) => o.name);

    const newOptions = ['incoming', 'outgoing', 'system'];
    const needsUpdate = newOptions.some(name => !existingNames.includes(name));

    if (needsUpdate) {
      const allOptions = [...new Set([...existingNames, ...newOptions])].map(name => ({ name }));
      await updateField(token, appToken, tableId, directionField.field_id, 'direction', {
        options: allOptions,
      });
    } else {
      console.log(`✅ direction already has required options`);
    }
  }

  // 3. Create missing fields
  const fieldsToCreate = [
    {
      name: 'message_record_id',
      type: 1, // Text
    },
    {
      name: 'event_type',
      type: 3, // Single Select
      property: {
        options: [
          { name: 'follow' },
          { name: 'unfollow' },
          { name: 'message' },
          { name: 'postback' },
        ],
      },
    },
    {
      name: 'message_type',
      type: 3, // Single Select
      property: {
        options: [
          { name: 'text' },
          { name: 'system' },
          { name: 'postback' },
        ],
      },
    },
    {
      name: 'payload',
      type: 1, // Text
    },
    {
      name: 'message_id',
      type: 1, // Text
    },
    {
      name: 'raw_json',
      type: 1, // Text (Long text)
    },
    {
      name: 'parent_user',
      type: 18, // Relation
      property: {
        table_id: friendsTableId,
        multiple: false,
      },
    },
  ];

  for (const field of fieldsToCreate) {
    if (!fieldMap.has(field.name)) {
      await createField(token, appToken, tableId, field.name, field.type, field.property);
      await new Promise(resolve => setTimeout(resolve, 500)); // Rate limiting
    } else {
      console.log(`✅ ${field.name} already exists`);
    }
  }

  console.log('\n✅ Message Table setup complete!\n');
  console.log('📋 Verifying fields...\n');

  // Verify
  const updatedFields = await getExistingFields(token, appToken, tableId);
  const requiredFields = [
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

  console.log('Field verification:');
  requiredFields.forEach(name => {
    const exists = updatedFields.some((f: any) => f.field_name === name);
    if (exists) {
      console.log(`✅ ${name}`);
    } else {
      console.log(`❌ ${name} - MISSING`);
    }
  });
}

setupMessageTableFields().catch(console.error);

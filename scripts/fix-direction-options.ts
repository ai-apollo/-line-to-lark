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

async function fixDirectionOptions() {
  console.log('🔧 Fixing direction field options...\n');

  const token = await getLarkToken();
  const appToken = process.env.LARK_APP_TOKEN!;
  const tableId = process.env.LARK_MESSAGES_TABLE_ID!;

  // Get current fields
  const resp = await fetch(
    `https://open.larksuite.com/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/fields`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  const result: any = await resp.json();
  const fields = result.data?.items || [];

  // Find direction field
  const directionField = fields.find((f: any) => f.field_name === 'direction');

  if (!directionField) {
    console.error('❌ direction field not found!');
    return;
  }

  console.log('📊 Current direction field:');
  console.log('  Field ID:', directionField.field_id);
  console.log('  Type:', directionField.type);
  console.log('  Current options:', directionField.property?.options?.map((o: any) => o.name).join(', '));

  // Update to correct options
  const updateResp = await fetch(
    `https://open.larksuite.com/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/fields/${directionField.field_id}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        field_name: 'direction',
        type: 3,
        property: {
          options: [
            { name: 'incoming' },
            { name: 'outgoing' },
            { name: 'system' },
          ],
        },
      }),
    }
  );

  const updateText = await updateResp.text();
  let updateResult: any;
  try {
    updateResult = JSON.parse(updateText);
  } catch {
    console.error('❌ Failed to parse response:', updateText);
    return;
  }

  if (updateResult.code === 0) {
    console.log('\n✅ direction options updated successfully!');
    console.log('  New options: incoming, outgoing, system');
  } else {
    console.error('\n❌ Failed to update direction options:', updateResult);
  }
}

fixDirectionOptions().catch(console.error);

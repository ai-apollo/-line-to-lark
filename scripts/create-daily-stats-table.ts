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
              field_name: 'date',
              type: 5, // Date
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
  fieldType: number
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
      }),
    }
  );

  const text = await resp.text();
  try {
    const result: any = JSON.parse(text);
    if (result.code === 0) {
      console.log(`  ✅ ${fieldName} created`);
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

async function createDailyStatsTable() {
  console.log('🔧 Creating daily_stats table...\n');

  const token = await getLarkToken();
  const appToken = process.env.LARK_APP_TOKEN!;

  console.log('App Token:', appToken);
  console.log('');

  // Create table
  const tableId = await createTable(token, appToken, 'daily_stats');

  if (!tableId) {
    console.error('Failed to create table');
    return;
  }

  console.log('\n📋 Adding fields...\n');

  // Create fields
  await createField(token, appToken, tableId, 'user_id', 1); // Text
  await new Promise(resolve => setTimeout(resolve, 500));

  await createField(token, appToken, tableId, 'msg_count', 2); // Number
  await new Promise(resolve => setTimeout(resolve, 500));

  await createField(token, appToken, tableId, 'first_ts', 5); // Date
  await new Promise(resolve => setTimeout(resolve, 500));

  await createField(token, appToken, tableId, 'last_ts', 5); // Date
  await new Promise(resolve => setTimeout(resolve, 500));

  await createField(token, appToken, tableId, 'incoming', 2); // Number
  await new Promise(resolve => setTimeout(resolve, 500));

  await createField(token, appToken, tableId, 'outgoing', 2); // Number
  await new Promise(resolve => setTimeout(resolve, 500));

  console.log('\n✅ daily_stats table created successfully!');
  console.log('\n📋 Next steps:');
  console.log(`1. Add to .env: LARK_DAILY_TABLE_ID=${tableId}`);
  console.log('2. Create aggregate cron job');
  console.log('3. Configure Vercel cron schedule');
}

createDailyStatsTable().catch(console.error);

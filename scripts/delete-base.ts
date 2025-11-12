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

async function deleteBase(baseToken: string) {
  const token = await getLarkToken();

  console.log(`🗑️  Deleting Base: ${baseToken}`);
  console.log(`📊 Base URL: https://tjpunq0typwo.jp.larksuite.com/base/${baseToken}`);
  console.log('');

  const resp = await fetch(
    `https://open.larksuite.com/open-apis/bitable/v1/apps/${baseToken}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!resp.ok) {
    const errorText = await resp.text();
    console.error('❌ Failed to delete Base:', resp.status);
    console.error('Response:', errorText);
    return false;
  }

  const result: any = await resp.json();

  if (result.code === 0) {
    console.log('✅ Base deleted successfully!');
    console.log('Response:', JSON.stringify(result, null, 2));
    return true;
  } else {
    console.error('❌ Failed to delete Base:', result.msg);
    console.error('Response:', JSON.stringify(result, null, 2));
    return false;
  }
}

async function main() {
  const baseToken = process.argv[2] || process.env.LARK_APP_TOKEN;

  if (!baseToken) {
    console.error('❌ Usage: npx ts-node scripts/delete-base.ts <base_token>');
    console.error('例: npx ts-node scripts/delete-base.ts Vssgb39WFa9iEXs9WSPj6TZ8pKh');
    console.error('');
    console.error('または、LARK_APP_TOKEN が .env に設定されている場合は引数不要');
    process.exit(1);
  }

  console.log('⚠️  WARNING: This will permanently delete the Base!');
  console.log('📊 Base token:', baseToken);
  console.log('');
  console.log('Press Ctrl+C to cancel, or wait 5 seconds to proceed...');
  console.log('');

  await new Promise(resolve => setTimeout(resolve, 5000));

  const success = await deleteBase(baseToken);

  if (success) {
    console.log('\n✅ Base has been deleted.');
  } else {
    console.log('\n❌ Failed to delete Base.');
    process.exit(1);
  }
}

main().catch(console.error);

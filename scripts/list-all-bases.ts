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

async function listAllBases() {
  const token = await getLarkToken();

  console.log('📊 Fetching all Bases...\n');

  // Get all files in "My Space" and filter for Bases (bitables)
  const resp = await fetch(
    'https://open.larksuite.com/open-apis/drive/v1/files?page_size=100',
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!resp.ok) {
    const errorText = await resp.text();
    console.error('❌ Failed to list files:', resp.status);
    console.error('Response:', errorText);
    return [];
  }

  const result: any = await resp.json();

  if (result.code !== 0) {
    console.error('❌ API Error:', result.msg);
    console.error('Response:', JSON.stringify(result, null, 2));
    return [];
  }

  const files = result.data?.files || [];
  const bases = files.filter((f: any) => f.type === 'bitable');

  console.log(`Found ${bases.length} Base(s):\n`);
  console.log('─'.repeat(100));

  bases.forEach((base: any, index: number) => {
    console.log(`\n[${index + 1}] ${base.name}`);
    console.log(`    Token: ${base.token}`);
    console.log(`    URL: https://tjpunq0typwo.jp.larksuite.com/base/${base.token}`);
    console.log(`    Owner: ${base.owner_id || '(unknown)'}`);
    console.log(`    Created: ${new Date(parseInt(base.created_time) * 1000).toLocaleString('ja-JP')}`);
  });

  console.log('\n' + '─'.repeat(100));
  console.log(`\nTotal: ${bases.length} Base(s)\n`);

  return bases;
}

async function main() {
  const bases = await listAllBases();

  if (bases.length === 0) {
    console.log('⚠️  No Bases found. This might mean:');
    console.log('   - No Bases exist yet');
    console.log('   - The app does not have permission to list files');
    console.log('   - Bases are in folders (need to search recursively)');
  }
}

main().catch(console.error);

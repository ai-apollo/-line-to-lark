import * as dotenv from 'dotenv';
dotenv.config();

const NEW_OWNER_OPEN_ID = 'ou_ae3b952c7b71d2d7aed0ef48c6a2bc70'; // あぽろ

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

async function listAllBases(token: string) {
  const resp = await fetch(
    'https://open.larksuite.com/open-apis/drive/v1/files?page_size=100',
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!resp.ok) {
    throw new Error(`Failed to list files: ${resp.status}`);
  }

  const result: any = await resp.json();
  const files = result.data?.files || [];
  return files.filter((f: any) => f.type === 'bitable');
}

async function transferOwnership(
  token: string,
  baseToken: string,
  newOwnerOpenId: string
) {
  const resp = await fetch(
    `https://open.larksuite.com/open-apis/drive/v1/permissions/${baseToken}/members/transfer_owner`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        member_type: 'openid',
        member_id: newOwnerOpenId,
        type: 'bitable',
      }),
    }
  );

  const result: any = await resp.json();
  return result;
}

async function main() {
  console.log('👑 Transferring ownership of all Bases...\n');
  console.log(`New owner: ${NEW_OWNER_OPEN_ID}\n`);

  const token = await getLarkToken();
  const bases = await listAllBases(token);

  console.log(`📊 Found ${bases.length} Base(s)\n`);
  console.log('─'.repeat(100));

  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (let i = 0; i < bases.length; i++) {
    const base = bases[i];
    const num = `[${i + 1}/${bases.length}]`;

    console.log(`\n${num} ${base.name}`);
    console.log(`    Token: ${base.token}`);
    console.log(`    Current owner: ${base.owner_id}`);

    try {
      const result = await transferOwnership(token, base.token, NEW_OWNER_OPEN_ID);

      if (result.code === 0) {
        console.log(`    ✅ Ownership transferred`);
        successCount++;
      } else if (result.code === 53045) {
        // Already owner
        console.log(`    ⏭️  Already owner (skipped)`);
        skipCount++;
      } else {
        console.log(`    ❌ Failed: ${result.msg} (code: ${result.code})`);
        errorCount++;
      }
    } catch (error: any) {
      console.log(`    ❌ Error: ${error.message}`);
      errorCount++;
    }

    // Rate limiting
    if (i < bases.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  console.log('\n' + '─'.repeat(100));
  console.log('\n📊 Summary:');
  console.log(`   ✅ Success: ${successCount}`);
  console.log(`   ⏭️  Skipped (already owner): ${skipCount}`);
  console.log(`   ❌ Failed: ${errorCount}`);
  console.log(`   📊 Total: ${bases.length}`);
  console.log('');

  if (errorCount > 0) {
    console.log('⚠️  Some operations failed. Check the errors above.');
    process.exit(1);
  } else {
    console.log('✅ All operations completed successfully!');
  }
}

main().catch(console.error);

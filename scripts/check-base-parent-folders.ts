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

async function getBaseMetadata(token: string, baseToken: string) {
  const resp = await fetch(
    `https://open.larksuite.com/open-apis/drive/v1/metas/batch_query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        request_docs: [
          {
            doc_token: baseToken,
            doc_type: 'bitable',
          },
        ],
        with_url: false,
      }),
    }
  );

  const result: any = await resp.json();
  return result.data?.metas?.[0] || null;
}

async function main() {
  console.log('🔍 Checking parent folders for all Bases...\n');

  const token = await getLarkToken();
  const bases = await listAllBases(token);

  console.log(`📊 Found ${bases.length} Base(s)\n`);
  console.log('─'.repeat(100));

  const parentFolders = new Set<string>();

  for (let i = 0; i < bases.length; i++) {
    const base = bases[i];
    console.log(`\n[${i + 1}/${bases.length}] ${base.name}`);
    console.log(`    Token: ${base.token}`);

    try {
      const meta = await getBaseMetadata(token, base.token);

      if (meta) {
        const parentToken = meta.parent_token || 'root';
        console.log(`    Parent folder token: ${parentToken}`);

        if (parentToken !== 'root') {
          parentFolders.add(parentToken);
        }
      } else {
        console.log(`    ⚠️  Could not get metadata`);
      }
    } catch (error: any) {
      console.log(`    ❌ Error: ${error.message}`);
    }

    // Rate limiting
    if (i < bases.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  console.log('\n' + '─'.repeat(100));
  console.log(`\n📁 Unique parent folders: ${parentFolders.size}\n`);

  if (parentFolders.size > 0) {
    console.log('Parent folder tokens:');
    Array.from(parentFolders).forEach((token, index) => {
      console.log(`  [${index + 1}] ${token}`);
    });
  } else {
    console.log('✅ All Bases are in root directory (no parent folders)');
  }

  // Save to JSON
  const fs = require('fs');
  fs.writeFileSync(
    'scripts/parent-folders.json',
    JSON.stringify(Array.from(parentFolders), null, 2),
    'utf-8'
  );
  console.log('\n✅ Saved to scripts/parent-folders.json\n');
}

main().catch(console.error);

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

async function getFileMetadata(token: string, fileToken: string) {
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
            doc_token: fileToken,
            doc_type: 'bitable',
          },
        ],
        with_url: false,
      }),
    }
  );

  const result: any = await resp.json();
  return result;
}

async function listFolderContents(token: string, folderToken?: string) {
  const url = folderToken
    ? `https://open.larksuite.com/open-apis/drive/v1/files/${folderToken}/children?page_size=100`
    : `https://open.larksuite.com/open-apis/drive/v1/files?page_size=100`;

  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!resp.ok) {
    throw new Error(`Failed to list files: ${resp.status}`);
  }

  const result: any = await resp.json();
  return result.data?.files || [];
}

async function getAllFoldersRecursive(
  token: string,
  folderToken?: string,
  depth: number = 0
): Promise<any[]> {
  const files = await listFolderContents(token, folderToken);
  const folders: any[] = [];

  for (const file of files) {
    if (file.type === 'folder') {
      folders.push({
        ...file,
        depth,
        parent_token: folderToken || 'root',
      });

      // Recursively get subfolders
      if (depth < 5) {
        // Limit recursion depth
        const subfolders = await getAllFoldersRecursive(token, file.token, depth + 1);
        folders.push(...subfolders);
      }
    }
  }

  return folders;
}

async function main() {
  console.log('📁 Fetching all folders...\n');

  const token = await getLarkToken();
  const folders = await getAllFoldersRecursive(token);

  console.log(`Found ${folders.length} folder(s):\n`);
  console.log('─'.repeat(100));

  folders.forEach((folder, index) => {
    const indent = '  '.repeat(folder.depth);
    console.log(`\n[${index + 1}] ${indent}${folder.name}`);
    console.log(`    ${indent}Token: ${folder.token}`);
    console.log(`    ${indent}Parent: ${folder.parent_token}`);
    console.log(`    ${indent}Owner: ${folder.owner_id || '(unknown)'}`);
  });

  console.log('\n' + '─'.repeat(100));
  console.log(`\nTotal: ${folders.length} folder(s)\n`);

  // Save to JSON for reference
  const fs = require('fs');
  fs.writeFileSync(
    'scripts/folders-list.json',
    JSON.stringify(folders, null, 2),
    'utf-8'
  );
  console.log('✅ Saved to scripts/folders-list.json\n');
}

main().catch(console.error);

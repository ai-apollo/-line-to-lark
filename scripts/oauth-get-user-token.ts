import * as dotenv from 'dotenv';
import * as http from 'http';
import { URL } from 'url';
dotenv.config();

const APP_ID = process.env.LARK_APP_ID!;
const APP_SECRET = process.env.LARK_APP_SECRET!;
const REDIRECT_URI = 'http://localhost:3000/callback';
const PORT = 3000;

// 必要なスコープ
const SCOPES = [
  'bitable:app',           // Base管理
  'docs:doc',              // Docs管理
  'drive:drive',           // Drive（ファイル）管理
].join(' ');

let server: http.Server;

async function exchangeCodeForToken(code: string) {
  const resp = await fetch(
    'https://open.larksuite.com/open-apis/authen/v1/oidc/access_token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: APP_ID,
        client_secret: APP_SECRET,
        code: code,
        redirect_uri: REDIRECT_URI,
      }),
    }
  );

  const result: any = await resp.json();

  if (result.code !== 0) {
    console.error('❌ Token exchange failed:', result);
    return null;
  }

  return result.data;
}

function startServer(): Promise<string> {
  return new Promise((resolve) => {
    server = http.createServer(async (req, res) => {
      const url = new URL(req.url!, `http://localhost:${PORT}`);

      if (url.pathname === '/callback') {
        const code = url.searchParams.get('code');

        if (!code) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('❌ Authorization code not found');
          return;
        }

        console.log('\n✅ Authorization code received!');
        console.log('🔄 Exchanging code for access token...\n');

        const tokenData = await exchangeCodeForToken(code);

        if (!tokenData) {
          res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('❌ Failed to exchange token');
          return;
        }

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <html>
            <head><title>Success</title></head>
            <body style="font-family: sans-serif; padding: 50px; text-align: center;">
              <h1>✅ Authorization successful!</h1>
              <p>You can close this window and return to the terminal.</p>
            </body>
          </html>
        `);

        console.log('✅ User Access Token obtained!\n');
        console.log('─'.repeat(80));
        console.log('\n📋 Token Information:\n');
        console.log('Access Token:', tokenData.access_token);
        console.log('Expires in:', tokenData.expires_in, 'seconds');
        console.log('Refresh Token:', tokenData.refresh_token || '(none)');
        console.log('\n─'.repeat(80));
        console.log('\n📝 Copy the Access Token above and use it in the next step.\n');

        // Save to .env.local for next step
        const fs = require('fs');
        fs.writeFileSync(
          '.env.local',
          `USER_ACCESS_TOKEN=${tokenData.access_token}\n`,
          'utf-8'
        );
        console.log('✅ Token saved to .env.local\n');

        server.close();
        resolve(tokenData.access_token);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    server.listen(PORT, () => {
      console.log(`🚀 OAuth server started on http://localhost:${PORT}\n`);
    });
  });
}

async function main() {
  console.log('🔐 Lark OAuth - User Access Token Flow\n');
  console.log('─'.repeat(80));
  console.log('\nThis will open your browser to authorize the app.\n');

  // Start callback server
  const tokenPromise = startServer();

  // Generate authorization URL
  const authUrl = new URL('https://open.larksuite.com/open-apis/authen/v1/authorize');
  authUrl.searchParams.set('app_id', APP_ID);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('scope', SCOPES);
  authUrl.searchParams.set('state', 'STATE');

  console.log('📱 Please open this URL in your browser:\n');
  console.log(authUrl.toString());
  console.log('\n─'.repeat(80));
  console.log('\nWaiting for authorization...\n');

  // Wait for token
  await tokenPromise;

  console.log('✅ Done! You can now run the permission script with USER_ACCESS_TOKEN.\n');
}

main().catch(console.error);

import type { VercelRequest, VercelResponse } from '@vercel/node';

// Chat history contains patient conversations. No caller authorization boundary
// exists in this project yet (chat-interface.html calls this endpoint anonymously),
// so the endpoint stays fail-closed and never reaches Lark. The reader lives in
// api/_lib/chat-history.ts (readChatHistory / parseUserId / parseLimit); wire it in
// here only behind a real authorization check.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  return res.status(403).json({ error: 'Chat history access is not available' });
}

// One-shot helper: récupère un refresh_token Google OAuth pour le SEO agent.
//
// Usage (depuis la racine du repo):
//   GOOGLE_OAUTH_CLIENT_ID="..." \
//   GOOGLE_OAUTH_CLIENT_SECRET="..." \
//   npx -y -p googleapis@131 node scripts/get-refresh-token.mjs
//
// Ouvre un navigateur, te demande de te logguer (julien@messagingme.fr),
// et imprime le refresh_token à coller en GitHub Secret GOOGLE_OAUTH_REFRESH_TOKEN.

import http from 'node:http';
import { URL } from 'node:url';
import { exec } from 'node:child_process';
import { google } from 'googleapis';

const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const PORT = 3033;
const REDIRECT_URI = `http://localhost:${PORT}`;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌ Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET env vars');
  process.exit(1);
}

const oauth2 = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: [
    'https://www.googleapis.com/auth/analytics.readonly',
    'https://www.googleapis.com/auth/webmasters.readonly',
  ],
});

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, REDIRECT_URI);
    if (!u.searchParams.has('code')) {
      res.writeHead(400);
      res.end('No code in callback');
      return;
    }
    const code = u.searchParams.get('code');
    const { tokens } = await oauth2.getToken(code);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><html><body style="font-family:system-ui;padding:40px;text-align:center;">
      <h1 style="color:#059669;">✅ Token reçu</h1>
      <p>Tu peux fermer cette fenêtre. Le terminal a la clé.</p></body></html>`);

    if (!tokens.refresh_token) {
      console.error('\n❌ Pas de refresh_token retourné. Le compte a déjà autorisé cet app — révoque l\'accès sur https://myaccount.google.com/permissions puis relance.');
      process.exit(1);
    }

    console.log('\n✅ Refresh token obtenu.\n');
    console.log('Set it as a GitHub secret:\n');
    console.log(`  printf '%s' '${tokens.refresh_token}' | gh secret set GOOGLE_OAUTH_REFRESH_TOKEN\n`);
    console.log('Raw value (à conserver en lieu sûr — ne pas committer):');
    console.log(tokens.refresh_token);
    console.log('');
    server.close();
    process.exit(0);
  } catch (e) {
    console.error('OAuth exchange error:', e?.message || e);
    res.writeHead(500);
    res.end('Error: ' + (e?.message || 'unknown'));
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log(`📡 Listening on ${REDIRECT_URI}`);
  console.log('\n→ Connecte-toi avec julien@messagingme.fr et accepte les permissions.\n');
  const cmd =
    process.platform === 'win32' ? `start "" "${authUrl}"` :
    process.platform === 'darwin' ? `open "${authUrl}"` :
    `xdg-open "${authUrl}"`;
  exec(cmd, (err) => {
    if (err) {
      console.log('Navigateur pas ouvert auto. Lien :\n' + authUrl);
    }
  });
});

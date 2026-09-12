/**
 * PeaceX - one-time Spotify authorization (auto-capture).
 *
 * Reads Spotify client credentials from cookies.json, starts a tiny local
 * server on port 3000 (matches redirect_url http://localhost:3000/callback),
 * prints the authorization URL, and automatically captures the `code` when the
 * browser redirects after you click AGREE. It then exchanges the code for
 * access+refresh tokens and saves them to .data/spotify.data (the file play-dl
 * loads so /spotify works).
 *
 *   npm run spotify
 *
 * NOTE: redirect_url MUST match the registered URI in the Spotify app
 * dashboard (currently http://localhost:3000/callback). If it changes, update
 * cookies.json AND this server's path below.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, '.data');
const DATA_FILE = path.join(DATA, 'spotify.data');

// Must match the registered redirect_uri path exactly.
const CALLBACK_PATH = '/callback';
const PORT = 3000;

function loadSpotifyCfg() {
  for (const f of [path.join(ROOT, 'cookies.json'), path.join(DATA, 'cookies.json')]) {
    try {
      const cfg = JSON.parse(fs.readFileSync(f, 'utf8'));
      if (cfg && cfg.spotify && cfg.spotify.client_id) return cfg.spotify;
    } catch {}
  }
  return null;
}

function post(url, body, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = new TextEncoder().encode(body);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': data.length, ...headers },
      },
      (res) => {
        let ch = '';
        res.on('data', (d) => (ch += d));
        res.on('end', () => {
          try {
            resolve(JSON.parse(ch));
          } catch {
            reject(new Error('Spotify returned non-JSON: ' + ch.slice(0, 300)));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function exchange(cfg, code) {
  const basic = Buffer.from(`${cfg.client_id}:${cfg.client_secret}`).toString('base64');
  return post(
    'https://accounts.spotify.com/api/token',
    `grant_type=authorization_code&code=${encodeURIComponent(code)}&redirect_uri=${encodeURIComponent(cfg.redirect_url)}`,
    { Authorization: `Basic ${basic}` }
  );
}

function main() {
  const cfg = loadSpotifyCfg();
  if (!cfg) {
    console.error('No Spotify client credentials found in cookies.json (spotify.client_id).');
    process.exit(1);
  }

  const market = cfg.market || 'IN';
  const authUrl =
    `https://accounts.spotify.com/authorize?client_id=${encodeURIComponent(cfg.client_id)}` +
    `&response_type=code&redirect_uri=${encodeURIComponent(cfg.redirect_url)}`;

  // Simple HTML we respond with after capturing the code.
  const okHtml = `<html><body style="font-family:sans-serif;background:#121212;color:#1DB954;display:flex;align-items:center;justify-content:center;height:100vh;">
    <div style="text-align:center"><h1>Authorization received!</h1><p>You can close this tab and return to the terminal.</p></div></body></html>`;
  const errHtml = (msg) =>
    `<html><body style="font-family:sans-serif"><h2>Authorization failed</h2><p>${msg}</p></body></html>`;

  const server = http.createServer((req, res) => {
    const u = new URL(req.url, `http://localhost:${PORT}`);
    if (u.pathname !== CALLBACK_PATH) {
      res.writeHead(404).end('Not found');
      return;
    }
    const code = u.searchParams.get('code');
    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end(errHtml('No code parameter in the redirect. Was the app already approved? Re-run and click AGREE again.'));
      return;
    }
    console.log('Code captured. Exchanging for tokens...');
    exchange(cfg, code)
      .then((tok) => {
        if (!tok || !tok.access_token || !tok.refresh_token) {
          throw new Error('Spotify did not return tokens: ' + JSON.stringify(tok));
        }
        const data = {
          client_id: cfg.client_id,
          client_secret: cfg.client_secret,
          redirect_url: cfg.redirect_url,
          access_token: tok.access_token,
          refresh_token: tok.refresh_token,
          expires_in: Number(tok.expires_in),
          expiry: Date.now() + (Number(tok.expires_in) - 1) * 1000,
          token_type: tok.token_type,
          market,
          file: true,
        };
        fs.mkdirSync(DATA, { recursive: true });
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(okHtml);
        console.log('Saved Spotify token to ' + DATA_FILE);
        server.close(() => {
          console.log('Done. Restart the bot (npm run dev) and Spotify should work.');
          process.exit(0);
        });
      })
      .catch((e) => {
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end(errHtml(e.message));
        console.error('Token exchange failed:', e.message);
      });
  });

  server.listen(PORT, '127.0.0.1', () => {
    console.log('Listening for the Spotify callback on http://localhost:' + PORT + CALLBACK_PATH);
    console.log('Open this URL in your browser, log in to Spotify, and click AGREE:');
    console.log('\n  ' + authUrl + '\n');
    console.log('The code will be captured automatically when the browser redirects back.');
  });

  server.on('error', (e) => {
    console.error('Could not start local server on port ' + PORT + ': ' + e.message);
    console.error('Close whatever is using port ' + PORT + ' and run `npm run spotify` again.');
    process.exit(1);
  });
}

main();

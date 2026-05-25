const express = require('express');
const cors = require('cors');
const https = require('https');
const crypto = require('crypto');
const puppeteer = require('puppeteer-core');

const app = express();
const PORT = process.env.PORT || 3000;
const CHROME_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable';

app.use(cors({ origin: '*' }));
app.options('*', cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'Robot UAGRM', chrome: CHROME_PATH });
});

function md5Hash(password) {
  return crypto.createHash('md5').update(password).digest('hex').substring(0, 8);
}

function postToUagrm(sessionId, username, passwordHash) {
  return new Promise((resolve, reject) => {
    const body = `username=${encodeURIComponent(username)}&password=${passwordHash}`;
    const options = {
      hostname: 'perfil.uagrm.edu.bo',
      path: '/estudiantes/verif_est.php',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Content-Length': Buffer.byteLength(body),
        'Cookie': 'PHPSESSID=' + sessionId,
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': 'https://perfil.uagrm.edu.bo/estudiantes/default.php',
        'Origin': 'https://perfil.uagrm.edu.bo',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

app.post('/api/verificar', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ valid: false, error: 'Faltan credenciales' });
  }

  let browser = null;

  try {
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: [
        '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
        '--disable-gpu', '--single-process', '--no-zygote',
        '--disable-extensions', '--disable-background-networking',
        '--disable-default-apps', '--mute-audio', '--no-first-run'
      ]
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Visit portal to get PHPSESSID cookie
    await page.goto('https://perfil.uagrm.edu.bo/estudiantes/default.php', {
      waitUntil: 'domcontentloaded',
      timeout: 20000
    });

    // Extract PHPSESSID from cookies
    const cookies = await page.cookies();
    const sessionCookie = cookies.find(c => c.name === 'PHPSESSID');
    const sessionId = sessionCookie ? sessionCookie.value : '';

    if (!sessionId) {
      await browser.close();
      return res.json({ valid: false, error: 'No se pudo obtener sesion del portal', debug: { cookies } });
    }

    await browser.close();
    browser = null;

    // Compute password hash (same as portal: substr(md5(password), 0, 8))
    const passwordHash = md5Hash(password);

    // Make direct POST to verif_est.php with session cookie
    const result = await postToUagrm(sessionId, username, passwordHash);

    let valid = false;
    let reason = '';

    if (result.status === 401) {
      valid = false;
      reason = 'Sesion rechazada (401)';
    } else if (result.body && result.body.toLowerCase().includes('error')) {
      valid = false;
      reason = result.body.substring(0, 80);
    } else if (result.status === 200 && result.body && result.body.length > 0) {
      valid = true;
      reason = 'Login aceptado';
    } else {
      valid = false;
      reason = 'Respuesta inesperada: HTTP ' + result.status + ' Body: ' + (result.body || '').substring(0, 80);
    }

    return res.json({ valid, reason, debug: { sessionId, passwordHash, httpStatus: result.status, bodyPreview: (result.body || '').substring(0, 120) } });

  } catch (err) {
    if (browser) {
      await browser.close().catch(() => {});
      browser = null;
    }
    console.error('Error:', err.message);
    return res.status(500).json({ valid: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log('Robot UAGRM escuchando en puerto', PORT);
  console.log('Chrome path:', CHROME_PATH);
});

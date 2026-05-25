const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer-core');

const app = express();
const PORT = process.env.PORT || 3000;
const CHROME_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable';

// CORS: allow any origin (InfinityFree frontend)
app.use(cors({ origin: '*' }));
app.options('*', cors());
app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'Robot UAGRM', chrome: CHROME_PATH });
});

// Main verification endpoint
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
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process',
        '--no-zygote',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-default-apps',
        '--mute-audio',
        '--no-first-run'
      ]
    });

    const page = await browser.newPage();

    // Set realistic user agent
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Set viewport
    await page.setViewport({ width: 1280, height: 720 });

    // Go to login page - use networkidle2 to wait for JS to run
    await page.goto('https://perfil.uagrm.edu.bo/estudiantes/default.php', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Wait for username field
    await page.waitForSelector('#username', { timeout: 10000 });

    // Fill credentials via page.evaluate (avoids frame issues with type())
    await page.evaluate((user, pass) => {
      document.getElementById('username').value = user;
      document.getElementById('password').value = pass;
    }, username, password);

    // Capture AJAX response by intercepting fetch inside the browser
    // This avoids ALL frame detachment issues — we get the body before any redirect
    const ajaxResult = await page.evaluate(async () => {
      return new Promise((resolve) => {
        const origFetch = window.fetch.bind(window);
        window.fetch = function(url, opts) {
          if (typeof url === 'string' && url.includes('verif_est.php')) {
            return origFetch(url, opts).then(async (resp) => {
              window.fetch = origFetch;
              resolve({ status: resp.status, body: await resp.text() });
              return resp;
            });
          }
          return origFetch(url, opts);
        };

        document.getElementById('login').click();

        setTimeout(() => {
          window.fetch = origFetch;
          resolve({ status: 0, body: '__TIMEOUT__' });
        }, 15000);
      });
    });

    const errorKeywords = [
      'incorrecta', 'invalida', 'error', 'bloqueada',
      'incorrecto', 'invalid', 'wrong', 'failed'
    ];

    let valid = false;
    let reason = '';

    if (ajaxResult.body === '__TIMEOUT__') {
      valid = false;
      reason = 'Timeout — el portal UAGRM no respondio';
    } else if (ajaxResult.body.toLowerCase().includes('error')) {
      valid = false;
      reason = ajaxResult.body.substring(0, 80);
    } else {
      valid = true;
      reason = 'Login aceptado por el portal';
    }

    await browser.close();
    browser = null;

    return res.json({ valid, reason });

  } catch (err) {
    if (browser) {
      await browser.close().catch(() => {});
      browser = null;
    }
    console.error('Error en verificacion:', err.message);
    return res.status(500).json({ valid: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log('Robot UAGRM escuchando en puerto', PORT);
  console.log('Chrome path:', CHROME_PATH);
});

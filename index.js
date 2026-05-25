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

    // Go to login page
    await page.goto('https://perfil.uagrm.edu.bo/estudiantes/default.php', {
      waitUntil: 'load',
      timeout: 45000
    });

    // Wait for username field
    await page.waitForSelector('#username', { timeout: 15000 });

    // Fill credentials using page.type (triggers proper input events)
    await page.click('#username');
    await page.type('#username', username, { delay: 30 });
    await page.click('#password');
    await page.type('#password', password, { delay: 30 });

    // Capture AJAX response by intercepting fetch AND XHR inside the browser
    const ajaxResult = await page.evaluate(async () => {
      return new Promise((resolve) => {
        function restore() {
          window.fetch = origFetch;
          window.XMLHttpRequest = origXHR;
        }

        const origFetch = window.fetch.bind(window);
        const origXHR = window.XMLHttpRequest;

        window.fetch = function(url, opts) {
          if (typeof url === 'string' && url.includes('verif_est.php')) {
            return origFetch(url, opts).then(async (resp) => {
              restore();
              resolve({ status: resp.status, body: await resp.text() });
              return resp;
            });
          }
          return origFetch(url, opts);
        };

        window.XMLHttpRequest = function() {
          const xhr = new origXHR();
          const origOpen = xhr.open;
          xhr.open = function(method, url) {
            if (typeof url === 'string' && url.includes('verif_est.php')) {
              xhr.addEventListener('load', function() {
                restore();
                resolve({ status: xhr.status, body: xhr.responseText });
              });
            }
            return origOpen.apply(this, arguments);
          };
          return xhr;
        };

        document.getElementById('login').click();

        setTimeout(() => {
          restore();
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

    return res.json({ valid, reason, ajaxDebug: ajaxResult.body.substring(0, 150) });

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

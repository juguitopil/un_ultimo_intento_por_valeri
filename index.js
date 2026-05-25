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

    // Wait for username field to appear
    await page.waitForSelector('#username', { timeout: 10000 });

    // Fill username
    await page.click('#username');
    await page.type('#username', username, { delay: 30 });

    // Fill password
    await page.click('#password');
    await page.type('#password', password, { delay: 30 });

    // Use page-level response event to capture the AJAX response
    // This avoids "Navigating frame was detached" from waitForResponse
    let ajaxBody = null;
    function onResponse(resp) {
      if (resp.url().includes('verif_est.php')) {
        resp.text().then(t => { ajaxBody = t; }).catch(() => {});
      }
    }
    page.on('response', onResponse);

    // Click login button
    await page.click('#login');

    // Wait for AJAX response or possible navigation redirect
    await new Promise(resolve => setTimeout(resolve, 6000));

    page.off('response', onResponse);

    // Check current URL
    const currentUrl = page.url();
    const pageContent = await page.content().catch(() => '');

    const loginUrl = 'default.php';
    const errorKeywords = [
      'incorrecta', 'invalida', 'error', 'bloqueada',
      'incorrecto', 'invalid', 'wrong', 'failed'
    ];

    let valid = false;
    let reason = '';

    // 1. If URL changed away from login page → success (redirect)
    if (!currentUrl.includes(loginUrl)) {
      valid = true;
      reason = 'URL cambio a: ' + currentUrl;
    }
    // 2. If AJAX response says "Error:" → invalid
    else if (ajaxBody && ajaxBody.toLowerCase().includes('error')) {
      valid = false;
      reason = 'AJAX: ' + ajaxBody.substring(0, 80);
    }
    // 3. Check for error text in page
    else if (errorKeywords.some(kw => pageContent.toLowerCase().includes(kw))) {
      valid = false;
      reason = 'Pagina de error detectada';
    }
    // 4. Check for logged-in elements
    else {
      const loggedInSelectors = [
        '.navbar-nav', '.profile', '.bienvenido',
        '#logout', '.user-info', '.estudiante-nombre'
      ];
      for (const sel of loggedInSelectors) {
        const el = await page.$(sel).catch(() => null);
        if (el) {
          valid = true;
          reason = 'Elemento de sesion encontrado: ' + sel;
          break;
        }
      }
      if (!valid) {
        reason = ajaxBody
          ? 'Respuesta AJAX: ' + ajaxBody.substring(0, 80)
          : 'Sigue en login sin mensaje de error claro';
      }
    }

    await browser.close();
    browser = null;

    return res.json({ valid, reason, url: currentUrl });

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

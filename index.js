const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer-core');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*' }));
app.options('*', cors());
app.use(express.json());

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'Robot UAGRM Puppeteer' });
});

async function loginConPuppeteer(username, password) {
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable',
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process',
      '--no-zygote'
    ]
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });

    await page.goto('https://carnetizacion.uagrm.edu.bo/login', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    await sleep(4000);

    await page.mouse.click(640, 360);
    await sleep(500);

    await page.keyboard.type(username);
    await sleep(300);
    await page.keyboard.press('Tab');
    await sleep(300);
    await page.keyboard.type(password);
    await sleep(300);
    await page.keyboard.press('Enter');

    await sleep(5000);

    const storage = await page.evaluate(() => {
      const items = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        items[k] = localStorage.getItem(k);
      }
      return items;
    });

    const tieneSesion = !!storage['FlutterSecureStorage.auth_sesion'];

    return {
      valid: tieneSesion,
      storage,
      url: page.url()
    };

  } catch (err) {
    return { valid: false, error: err.message };
  } finally {
    await browser.close();
  }
}

app.post('/api/verificar', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ valid: false, error: 'Faltan credenciales' });
  }

  try {
    const result = await loginConPuppeteer(username, password);

    if (result.error) {
      return res.json({
        valid: false,
        reason: 'Error Puppeteer: ' + result.error,
        debug: result
      });
    }

    return res.json({
      valid: result.valid,
      reason: result.valid ? 'Login exitoso en carnetizacion' : 'No se detecto sesion activa',
      sesion: result.valid ? result.storage['FlutterSecureStorage.auth_sesion'] : '',
      estudianteData: result.storage['flutter.estudiante_data'] || '',
      debug: {
        url: result.url,
        localStorageKeys: Object.keys(result.storage)
      }
    });

  } catch (err) {
    return res.status(500).json({ valid: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log('Robot UAGRM Puppeteer escuchando en puerto', PORT);
  console.log('Login contra carnetizacion.uagrm.edu.bo/login');
});
const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*' }));
app.options('*', cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'Robot UAGRM Puppeteer' });
});

async function loginConPuppeteer(username, password) {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-zygote'
    ]
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });

    // Navegar al login de carnetizacion
    await page.goto('https://carnetizacion.uagrm.edu.bo/login', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Esperar que cargue la app Flutter (canvas o flutter-view)
    await page.waitForTimeout(4000);

    // Hacer clic en el centro de la pantalla para enfocar el canvas Flutter
    await page.mouse.click(640, 360);
    await page.waitForTimeout(500);

    // Escribir credenciales mediante teclado
    await page.keyboard.type(username);
    await page.waitForTimeout(300);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(300);
    await page.keyboard.type(password);
    await page.waitForTimeout(300);
    await page.keyboard.press('Enter');

    // Esperar que el login se procese
    await page.waitForTimeout(5000);

    // Extraer localStorage (donde Flutter guarda la sesión)
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
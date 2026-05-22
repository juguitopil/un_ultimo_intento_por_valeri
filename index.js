const express = require('express');
const cors    = require('cors');
const puppeteer = require('puppeteer-core');

const app  = express();
const PORT = process.env.PORT || 3000;

// Ruta del binario de Chrome - confirmada en el Dockerfile
const CHROME_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable';

app.use(express.json());
app.use(cors({ origin: '*' }));
app.options('*', cors());

// ── Salud del servidor ──
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'Robot UAGRM', chrome: CHROME_PATH });
});

// ── Endpoint principal de verificacion ──
app.post('/api/verificar', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ valid: false, error: 'Faltan credenciales' });
  }

  let browser = null;

  try {
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',  // Fix error 1: evita crash por /dev/shm lleno
        '--disable-gpu',            // Fix error 1: reduce uso de RAM
        '--single-process',         // Fix error 1: un solo proceso = menos RAM
        '--no-zygote',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-sync',
        '--disable-translate',
        '--mute-audio',
        '--no-first-run',
      ],
    });

    const page = await browser.newPage();

    // Bloquear recursos innecesarios para ahorrar RAM y tiempo
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const blocked = ['image', 'stylesheet', 'font', 'media'];
      if (blocked.includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.setDefaultNavigationTimeout(30000);

    // Ir al portal de login
    await page.goto('https://perfil.uagrm.edu.bo/estudiantes/default.php', {
      waitUntil: 'networkidle2',
    });

    // Buscar los inputs por class="form-control" (confirmado en DevTools)
    const inputs = await page.$$('input.form-control');
    if (inputs.length < 2) {
      throw new Error('No se encontraron los campos del formulario');
    }

    // Escribir credenciales
    await inputs[0].type(username, { delay: 30 });
    await inputs[1].type(password, { delay: 30 });

    // Clic en el boton de login (id="login")
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 })
        .catch(() => {}), // Si no navega, continuar igual
      page.click('#login'),
    ]);

    // Esperar un momento para que la pagina procese
    await new Promise(r => setTimeout(r, 2000));

    const currentUrl = page.url();
    const pageContent = await page.content();
    const contentLower = pageContent.toLowerCase();

    // Determinar si el login fue exitoso
    let valid = false;
    let reason = '';

    // Señal 1: la URL cambio (ya no esta en default.php)
    if (!currentUrl.includes('default.php')) {
      valid = true;
      reason = 'URL cambio a: ' + currentUrl;
    }
    // Señal 2: el contenido muestra datos del perfil
    else if (
      contentLower.includes('datos personales') ||
      contentLower.includes('cerrar sesion') ||
      contentLower.includes('logout') ||
      contentLower.includes('inscripcion') ||
      contentLower.includes('malla curricular')
    ) {
      valid = true;
      reason = 'Contenido de perfil detectado';
    }
    // Señal 3: aun en login con mensaje de error
    else if (
      contentLower.includes('contrasena incorrecta') ||
      contentLower.includes('codigo incorrecto') ||
      contentLower.includes('datos incorrectos') ||
      contentLower.includes('error')
    ) {
      valid = false;
      reason = 'Mensaje de error en la pagina';
    } else {
      valid = false;
      reason = 'No se pudo determinar resultado';
    }

    await browser.close();
    browser = null;

    return res.json({ valid, reason, url: currentUrl });

  } catch (err) {
    console.error('[Robot Error]', err.message);
    if (browser) {
      await browser.close().catch(() => {});
      browser = null;
    }
    return res.status(500).json({ valid: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log('Robot UAGRM corriendo en puerto', PORT);
  console.log('Chrome path:', CHROME_PATH);
});

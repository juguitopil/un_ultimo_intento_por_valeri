const express = require('express');
const cors = require('cors');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*' }));
app.options('*', cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'Robot UAGRM (sin Puppeteer)' });
});

function httpsPost(urlPath, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'perfil.uagrm.edu.bo',
      path: urlPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Content-Length': Buffer.byteLength(body),
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': 'https://perfil.uagrm.edu.bo/estudiantes/default.php',
        'Origin': 'https://perfil.uagrm.edu.bo',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: data
      }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(body);
    req.end();
  });
}

app.post('/api/verificar', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ valid: false, error: 'Faltan credenciales' });
  }

  try {
    // POST directly to verif_est.php — password se envia tal cual (sin hash)
    // El portal NO hashea la contraseña, la envia en texto plano
    const postBody = `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
    const result = await httpsPost('/estudiantes/verif_est.php', postBody);

    let valid = false;
    let reason = '';

    if (result.body && result.body.toLowerCase().includes('error')) {
      valid = false;
      reason = result.body.substring(0, 100);
    } else if (result.status === 200 && result.body && result.body.length > 0) {
      valid = true;
      reason = 'Login aceptado';
    } else {
      valid = false;
      reason = 'HTTP ' + result.status + ' Body: ' + (result.body || '').substring(0, 100);
    }

    // Extract PHPSESSID from response for auto-login
    let sessionId = '';
    const setCookie = result.headers['set-cookie'];
    if (setCookie) {
      const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
      for (const c of cookies) {
        const match = c.match(/PHPSESSID=([a-zA-Z0-9]+)/);
        if (match && !match[1].includes('deleted')) {
          sessionId = match[1];
          break;
        }
      }
    }

    return res.json({
      valid,
      reason,
      sessionId: valid ? sessionId : '',
      debug: {
        httpStatus: result.status,
        setCookie: result.headers['set-cookie'] || '(none)',
        sessionId,
        responseBody: (result.body || '').substring(0, 200)
      }
    });

  } catch (err) {
    console.error('Error:', err.message);
    return res.status(500).json({ valid: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log('Robot UAGRM escuchando en puerto', PORT);
  console.log('Sin Puppeteer — usando https directo');
});

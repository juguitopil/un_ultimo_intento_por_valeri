const express = require('express');
const cors = require('cors');
const https = require('https');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*' }));
app.options('*', cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'Robot UAGRM (sin Puppeteer)' });
});

function md5Hash(password) {
  return crypto.createHash('md5').update(password).digest('hex').substring(0, 8);
}

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
    // Compute password hash (same as portal: substr(md5(password), 0, 8))
    const passwordHash = md5Hash(password);

    // POST directly to verif_est.php (no session needed — endpoint creates one)
    const postBody = `username=${encodeURIComponent(username)}&password=${passwordHash}`;
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

    return res.json({
      valid,
      reason,
      debug: {
        passwordHash,
        httpStatus: result.status,
        setCookie: result.headers['set-cookie'] || '(none)',
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

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

function httpsGet(urlPath) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'perfil.uagrm.edu.bo',
      path: urlPath,
      method: 'GET',
      headers: {
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
    req.end();
  });
}

function httpsPost(urlPath, body, sessionId) {
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
    if (sessionId) {
      options.headers['Cookie'] = 'PHPSESSID=' + sessionId;
    }
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

function extractSessionId(headers) {
  const setCookie = headers['set-cookie'];
  if (!setCookie) return '';
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
  for (const c of cookies) {
    const match = c.match(/PHPSESSID=([^;]+)/);
    if (match) return match[1];
  }
  return '';
}

app.post('/api/verificar', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ valid: false, error: 'Faltan credenciales' });
  }

  try {
    // Step 1: Get session from portal
    const loginPage = await httpsGet('/estudiantes/default.php');
    const sessionId = extractSessionId(loginPage.headers);

    if (!sessionId) {
      return res.json({
        valid: false,
        error: 'No se pudo obtener sesion del portal',
        debug: {
          httpStatus: loginPage.status,
          setCookie: loginPage.headers['set-cookie'] || '(none)'
        }
      });
    }

    // Step 2: Compute password hash (same as portal: substr(md5(password), 0, 8))
    const passwordHash = md5Hash(password);

    // Step 3: POST to AJAX endpoint with session
    const postBody = `username=${encodeURIComponent(username)}&password=${passwordHash}`;
    const result = await httpsPost('/estudiantes/verif_est.php', postBody, sessionId);

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
        sessionId,
        passwordHash,
        getStatus: loginPage.status,
        postStatus: result.status,
        postBody: (result.body || '').substring(0, 150)
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

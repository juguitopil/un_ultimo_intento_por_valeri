const express = require('express');
const cors = require('cors');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*' }));
app.options('*', cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'Robot UAGRM v2' });
});

const API_KEY = process.env.API_KEY || '2869b38539a19e13d44dc3e8d572f30677d9cf40d6a156b14981fb460f9343c2';

function httpsPost(hostname, path, body, extraHeaders) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Content-Length': Buffer.byteLength(body),
        ...extraHeaders
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

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function getPublicIP() {
  try {
    return (await httpsGet('https://api.ipify.org')).trim();
  } catch {
    return '0.0.0.0';
  }
}

app.post('/api/verificar', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ valid: false, error: 'Faltan credenciales' });
  }

  try {
    const publicIP = await getPublicIP();
    const postBody = `p1=${encodeURIComponent(username)}&p2=${encodeURIComponent(password)}&p3=${encodeURIComponent(publicIP)}&p4=Carnet&p5=123&p6=PERF`;

    const result = await httpsPost('tiluchi.uagrm.edu.bo', '/api/sesion/', postBody, { apikey: API_KEY });

    const valid = result.status === 201;
    const reason = valid ? 'Login aceptado' : `HTTP ${result.status}: ${(result.body || '').substring(0, 200)}`;

    return res.json({
      valid,
      reason,
      debug: {
        httpStatus: result.status,
        responseBody: (result.body || '').substring(0, 300)
      }
    });

  } catch (err) {
    console.error('Error:', err.message);
    return res.status(500).json({ valid: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log('Robot UAGRM v2 escuchando en puerto', PORT);
  console.log('Usando tiluchi.uagrm.edu.bo/api/sesion/');
});

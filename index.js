const express = require('express');
const cors    = require('cors');
const https   = require('https');
const crypto  = require('crypto');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cors({ origin: '*' }));
app.options('*', cors());

// ── Utilidades ───────────────────────────────────────────────────────────────

function buildMultipart(fields) {
  const boundary = `dart-http-boundary-${crypto.randomBytes(24).toString('base64url')}`;
  let body = '';
  for (const [name, value] of Object.entries(fields)) {
    body += `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`;
  }
  body += `--${boundary}--\r\n`;
  return { boundary, body };
}

function httpsPost(hostname, path, contentType, body) {
  return new Promise((resolve, reject) => {
    const buf = Buffer.from(body, 'utf8');
    const req = https.request({
      hostname, path, method: 'POST',
      headers: {
        'Content-Type': contentType,
        'Content-Length': buf.length,
        'User-Agent': 'Dart/3.3 (dart:io)',
        'Origin': 'https://carnetizacion.uagrm.edu.bo',
        'Referer': 'https://carnetizacion.uagrm.edu.bo/',
      },
      timeout: 15000,
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(buf);
    req.end();
  });
}

function httpsGetWithHeaders(hostname, path, headers) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname, path, method: 'GET', headers, timeout: 15000,
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        contentType: res.headers['content-type'] || '',
        body: Buffer.concat(chunks)   // Buffer para soportar binario (foto)
      }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

async function getPublicIP() {
  try {
    return await new Promise((resolve, reject) => {
      https.get('https://api.ipify.org', (res) => {
        let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d.trim()));
      }).on('error', reject);
    });
  } catch { return '0.0.0.0'; }
}

const APIKEY = '2869b38539a19e13d44dc3e8d572f30677d9cf40d6a156b14981fb460f9343c2';
const HEADERS_BASE = {
  'apikey': APIKEY,
  'Origin': 'https://carnetizacion.uagrm.edu.bo',
  'Referer': 'https://carnetizacion.uagrm.edu.bo/',
  'User-Agent': 'Dart/3.3 (dart:io)',
};

// ── Salud ────────────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.json({ status: 'ok', service: 'Robot UAGRM v3' }));

// ── Verificar credenciales ───────────────────────────────────────────────────
app.post('/api/verificar', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ valid: false, error: 'Faltan credenciales' });
  }

  try {
    // 1. Login en tiluchi
    const publicIP = await getPublicIP();
    const { boundary, body: postBody } = buildMultipart({
      p1: username, p2: password, p3: publicIP,
      p4: 'Carnet', p5: '123', p6: 'PERF',
    });

    const loginResult = await httpsPost(
      'tiluchi.uagrm.edu.bo', '/api/sesion/',
      `multipart/form-data; boundary=${boundary}`, postBody
    );

    if (loginResult.status !== 201) {
      return res.json({
        valid: false,
        reason: 'Credenciales incorrectas',
        debug: { status: loginResult.status, body: loginResult.body.toString() }
      });
    }

    const sesionData = JSON.parse(loginResult.body.toString());
    const idSesion   = sesionData.id_sesion || '';
    const codigo     = sesionData.codigo || username;

    // 2. Datos del estudiante
    const estResult = await httpsGetWithHeaders(
      'tiluchi.uagrm.edu.bo',
      `/carnetizacion/personas/estudiante/${codigo}`,
      HEADERS_BASE
    );

    let nombre = '', carrera = '', facultad = '', ci = '', telefonos = '';

    if (estResult.status === 200) {
      const est = JSON.parse(estResult.body.toString());
      nombre   = est.apellidos_nombres || '';
      ci       = est.documento_identidad || '';
      telefonos = est.telefono || '';
      // tiluchi devuelve 'origen' o '0' como clave
      const carreraKey = est.carreras ? (est.carreras['origen'] ? 'origen' : Object.keys(est.carreras)[0]) : null;
      if (est.carreras && carreraKey) {
        carrera  = est.carreras[carreraKey].nombre_carrera || '';
        facultad = est.carreras[carreraKey].facultad || '';
      }
    }

    // 3. Foto del estudiante en base64
    let fotoBase64 = '';
    // Intentar varios endpoints conocidos de foto
    const fotoEndpoints = [
      `/personal/${codigo}/foto`,
      `/carnetizacion/personas/foto/${codigo}`,
    ];
    for (const ep of fotoEndpoints) {
      try {
        const fotoResult = await httpsGetWithHeaders(
          'tiluchi.uagrm.edu.bo', ep, HEADERS_BASE
        );
        if (fotoResult.status === 200) {
          const bodyStr = fotoResult.body.toString();
          // Caso 1: respuesta JSON con data.foto (base64 string)
          try {
            const json = JSON.parse(bodyStr);
            const b64 = (json.data && json.data.foto) ? json.data.foto
                      : json.foto ? json.foto
                      : null;
            if (b64) {
              fotoBase64 = 'data:image/jpeg;base64,' + b64;
              break;
            }
          } catch(_) {}
          // Caso 2: respuesta binaria directa (JPEG)
          const ct = fotoResult.contentType || '';
          if (ct.includes('image') || fotoResult.body[0] === 0xFF) {
            fotoBase64 = 'data:image/jpeg;base64,' + fotoResult.body.toString('base64');
            break;
          }
        }
      } catch (e) {
        console.log('Foto endpoint', ep, 'fallo:', e.message);
      }
    }

    return res.json({
      valid:      true,
      reason:     'Login aceptado',
      id_sesion:  idSesion,
      codigo,
      nombre,
      carrera,
      facultad,
      ci,
      telefonos,
      foto_base64: fotoBase64,
    });

  } catch (err) {
    console.error('[Error]', err.message);
    return res.status(500).json({ valid: false, error: err.message });
  }
});

app.listen(PORT, () => console.log('Robot UAGRM v3 en puerto', PORT));
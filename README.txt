README - Robot UAGRM para Railway
==================================

ESTRUCTURA
----------
railway-robot/
    index.js        <- Servidor Express + Puppeteer
    package.json    <- Dependencias
    Dockerfile      <- Instala Chrome correctamente
    railway.toml    <- Config de Railway

COMO HACER EL DEPLOY EN RAILWAY
---------------------------------

1. Sube esta carpeta a un repositorio GitHub nuevo
   (puede ser privado)

2. En Railway:
   - New Project -> Deploy from GitHub repo
   - Seleccionar el repo

3. IMPORTANTE: En Settings -> Builder
   Asegurate de que diga "Dockerfile" (Railway lo detecta automatico)
   NO usar Nixpacks deprecated

4. En Settings -> Networking -> Generate Domain
   Copia la URL generada (ej: https://robot-uagrm-xxx.up.railway.app)

5. En Settings -> Resources
   Subir RAM a 1GB (Chrome lo necesita)
   El slider esta en la configuracion del servicio

6. Una vez deployado, probar en el navegador:
   https://tu-url.up.railway.app/
   Debe responder: {"status":"ok","service":"Robot UAGRM"}

7. Actualizar verificar.php en InfinityFree:
   Cambiar esta linea con tu URL real:
   define('RAILWAY_URL', ... 'https://TU-SERVICIO.up.railway.app');

DIAGNOSTICO DE ERRORES
-----------------------

Si 502 Bad Gateway:
  - Verificar que el Builder es Dockerfile, no Nixpacks
  - Verificar que RAM esta en 1GB
  - Ver los logs en Railway -> Deployments -> View Logs
  - Buscar "Chrome path:" en los logs al arrancar

Si Chrome no se encuentra:
  - En los logs buscar el error de executablePath
  - El Dockerfile instala google-chrome-stable en /usr/bin/
  - La variable PUPPETEER_EXECUTABLE_PATH ya esta configurada en el Dockerfile

Si timeout:
  - El robot tarda ~10-15 segundos por verificacion (normal)
  - verificar.php tiene timeout de 45 segundos (suficiente)

VARIABLES DE ENTORNO (opcionales)
----------------------------------
PORT          -> Railway lo asigna automatico (no tocar)
NODE_ENV      -> production (ya en Dockerfile)
PUPPETEER_EXECUTABLE_PATH -> /usr/bin/google-chrome-stable (ya en Dockerfile)

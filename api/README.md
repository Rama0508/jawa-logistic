# Jawa Logistic — API de extracción de productos

Servicio chico (Node + Express) que lee el link de un producto (Alibaba, 1688, AliExpress, Amazon, Mercado Libre) e intenta sacar el nombre, la imagen y el precio de los metadatos de la página.

## Qué SÍ hace
- Lee el `<title>`, `og:title`, `og:image`, `og:price`, y datos `application/ld+json` tipo `Product` si el sitio los expone.
- Funciona bien en sitios que renderizan esos datos en el HTML del servidor (Amazon suele traer al menos el título).

## Qué NO hace (importante)
- **Nunca va a poder traer peso ni medidas** — esos datos casi nunca están en la página de un producto. Eso lo sigue completando el cliente a mano.
- Sitios que arman el contenido con JavaScript (muchas páginas de Alibaba/1688) van a devolver poco o nada, porque este servicio solo lee el HTML inicial, no ejecuta JavaScript como un navegador. Para eso haría falta un navegador headless (Puppeteer/Playwright), que es un proyecto más grande — avisen si lo quieren en el futuro.
- Por seguridad, solo acepta URLs de una lista fija de dominios (`DOMINIOS_PERMITIDOS` en `server.js`) — no es un proxy genérico.

## Cómo correrlo local
```
cd api
npm install
npm start
```
Por defecto escucha en el puerto 3001. Probar con:
```
curl -X POST http://localhost:3001/api/extract -H "Content-Type: application/json" -d "{\"url\":\"https://www.amazon.com/dp/EJEMPLO\"}"
```

## Cómo desplegarlo en EasyPanel
1. Creá un **nuevo servicio "App"** (separado del sitio principal).
2. Como source, apuntá al mismo repo de GitHub, pero con **Build Path** (o "Context") en `/api` — así solo usa el `Dockerfile` de esta carpeta.
3. EasyPanel va a construir la imagen con el `Dockerfile` de acá (Node 20 + Express).
4. Asignale un dominio/subdominio (ej: `api.tudominio.com`) en la pestaña "Domains".
5. En variables de entorno, opcionalmente seteá `ORIGEN_PERMITIDO` con la URL de tu sitio público (ej: `https://tudominio.com`) para que solo tu sitio pueda llamar a esta API — si lo dejás sin setear, acepta pedidos desde cualquier origen.
6. Una vez que tengas la URL pública de este servicio, actualizá `API_BASE_URL` en `rates.js` (en la raíz del repo) con esa URL.

# OpenCode Web Chat

Chat web (estilo DeepSeek/Gemini) para conversar con **OpenCode** desde cualquier
navegador, sin terminal ni laptop. Incluye cuentas de usuario, API keys cifradas,
historial persistente, skills, adjuntar imágenes, streaming de respuestas y
simbología matemática **Unicode** (sin LaTeX).

```
┌──────────────┐   HTTP/JSON + SSE   ┌──────────────┐   SDK oficial   ┌──────────────────┐
│   Navegador  │ ──────────────────► │   Backend    │ ──────────────► │  Servidor de     │
│  Next.js +   │ ◄────────────────── │  Express.js  │ ◄────────────── │  OpenCode (v2)   │
│  Tailwind    │   text/event-stream │  SQLite      │  eventos SSE    │  opencode serve  │
└──────────────┘                     └──────────────┘                 └──────────────────┘
                                            │
                                     /data (disco persistente)
                                  SQLite · skills · uploads
```

---

## Índice

1. [Características](#características)
2. [Stack tecnológico](#stack-tecnológico)
3. [Requisitos](#requisitos)
4. [Puesta en marcha local](#puesta-en-marcha-local)
5. [Variables de entorno](#variables-de-entorno)
6. [Cómo funciona](#cómo-funciona)
7. [Referencia de la API](#referencia-de-la-api)
8. [Barra de prompt y comandos](#barra-de-prompt-y-comandos)
9. [Skills](#skills)
10. [Simbología matemática](#simbología-matemática)
11. [Tests](#tests)
12. [Despliegue en Render](#despliegue-en-render)
13. [Seguridad](#seguridad)
14. [Decisiones de diseño](#decisiones-de-diseño)
15. [Solución de problemas](#solución-de-problemas)
16. [Limitaciones conocidas](#limitaciones-conocidas)

---

## Características

- **Autenticación** con registro/login, JWT de 7 días y contraseñas con hash.
- **API keys por usuario** cifradas en reposo (AES-256-GCM) y registradas como
  credencial en el servidor de OpenCode.
- **Chat con streaming** en tiempo real mediante Server-Sent Events.
- **Lista dinámica de modelos** obtenida del servidor de OpenCode (con caché de 1 hora).
- **Skills**: subida de archivos `.md`/`.json`, instalación desde URL y listado de las
  skills propias y las del servidor, todo sobre el disco persistente.
- **Imágenes**: adjuntar hasta 5 imágenes (5 MB cada una) validadas por tipo MIME.
- **Historial** de conversaciones y mensajes en SQLite, con renombrado, borrado y
  reapertura automática de la última conversación al volver.
- **Diseño responsive** con barra lateral colapsable, tema claro/oscuro/sistema.
- **Simbología matemática Unicode** con fuentes *Noto Sans Math* / *Noto Sans Symbols 2*.

## Stack tecnológico

| Capa | Tecnología |
| --- | --- |
| Frontend | Next.js 15 (App Router, `output: export`) + React 19 + TypeScript |
| Estilos | Tailwind CSS 4 (configuración CSS-first) |
| Estado | Zustand |
| Backend | Node.js ≥ 20 + Express 5 (ESM) |
| Base de datos | SQLite vía `better-sqlite3` |
| Auth | `jsonwebtoken` + `bcryptjs` |
| Validación | `zod` |
| Integración OpenCode | `@opencode/client` (cliente oficial de la API HTTP de OpenCode v2) |
| CLI de OpenCode | `@opencode/cli` (dependencia npm; el backend la arranca sola) |
| Despliegue | Render (Web Service + disco persistente) + GitHub Actions |

## Requisitos

- **Node.js ≥ 20** (el proyecto se probó con Node 20, 22 y 26).
- Una cuenta/credencial de OpenCode (por ejemplo una API key `oc_sk_…`).
- Para el despliegue: cuenta de Render y repositorio en GitHub.

## Puesta en marcha local

```bash
# 1. Dependencias (monorepo con npm workspaces)
npm install

# 2. Variables de entorno
cp .env.example .env
#    Edita .env: como mínimo define JWT_SECRET y ENCRYPTION_KEY.

# 3. Compila el frontend (genera frontend/out)
npm run build

# 4. Arranca todo (API + OpenCode) en http://localhost:3001
npm start
```

El backend, si no le das `OPENCODE_BASE_URL`, **arranca `opencode serve` como proceso
hijo** en `127.0.0.1:4096` y se conecta a él. Abre <http://localhost:3001>, crea una
cuenta y ya puedes chatear.

### Desarrollo con recarga en caliente

```bash
# Terminal 1 — backend en :3001
npm run dev:backend

# Terminal 2 — Next en :3000 (apunta la API al backend)
cd frontend
NEXT_PUBLIC_API_BASE=http://localhost:3001 npm run dev
```

### Usar un servidor de OpenCode externo

```bash
OPENCODE_BASE_URL=https://mi-servidor-opencode
OPENCODE_SERVER_PASSWORD=mi-contraseña
OPENCODE_AUTOSTART=false
```

El backend habla con ese servidor usando autenticación Basic
(usuario `opencode`, contraseña = `OPENCODE_SERVER_PASSWORD`).

## Variables de entorno

| Variable | Por defecto | Descripción |
| --- | --- | --- |
| `NODE_ENV` | `development` | `production` activa cookies `secure` y oculta errores internos. |
| `PORT` | `3001` | Puerto HTTP. Render lo inyecta automáticamente. |
| `JWT_SECRET` | — | **Obligatorio en producción.** Firma de los JWT. |
| `ENCRYPTION_KEY` | — | **Obligatorio en producción.** Clave maestra de cifrado de las API keys. |
| `JWT_EXPIRES_IN` | `7d` | Caducidad del token. |
| `BCRYPT_ROUNDS` | `10` | Rondas de hash de contraseñas. |
| `DATA_DIR` | `/data` (prod) · tmp (dev) | Directorio raíz de datos. |
| `DATABASE_PATH` | `<DATA_DIR>/opencode.db` | Fichero SQLite. |
| `SKILLS_DIR` | `<DATA_DIR>/skills` | Skills por usuario. |
| `UPLOADS_DIR` | `<DATA_DIR>/uploads` | Imágenes adjuntas. |
| `FRONTEND_DIST` | `<raíz>/frontend/out` | Build estático que sirve Express. |
| `CORS_ORIGINS` | vacío | Lista separada por comas; vacío = permite el mismo origen. |
| `MAX_UPLOAD_BYTES` | `5242880` | Tamaño máximo por imagen (5 MB). |
| `MODELS_CACHE_TTL` | `3600000` | Caché de la lista de modelos (1 h). |
| `OPENCODE_BASE_URL` | vacío | Servidor de OpenCode externo. Si está vacío, se arranca uno propio. |
| `OPENCODE_SERVER_PASSWORD` | aleatoria | Contraseña del servidor (Basic auth). |
| `OPENCODE_AUTOSTART` | `true` | Arrancar `opencode serve` si no hay `OPENCODE_BASE_URL`. |
| `OPENCODE_PORT` | `4096` | Puerto interno del servidor gestionado. |
| `OPENCODE_BIN` | autodetectado | Ruta al binario `opencode`. |
| `OPENCODE_DIRECTORY` | `<DATA_DIR>/workspace` | Directorio de proyecto que OpenCode usa como *location*. |
| `OPENCODE_DEFAULT_MODEL` | `opencode-go/deepseek-v4.1-flash` | Formato `provider/model`. |
| `OPENCODE_DEFAULT_AGENT` | `build` | Agente por defecto. |
| `OPENCODE_CREDENTIAL_INTEGRATION` | `opencode-go` | Integración donde se registra la API key del usuario. |

Copia de referencia completa en [`.env.example`](./.env.example).

## Cómo funciona

### Flujo de datos

1. El usuario se registra o inicia sesión; el backend devuelve un JWT (y una cookie
   `httpOnly`) que el frontend guarda en `localStorage`.
2. Cada petición viaja con `Authorization: Bearer <jwt>`; el middleware `authJWT` la
   valida y carga el usuario.
3. Al chatear, el frontend hace `POST /api/chat` y **lee la respuesta como SSE**
   (`fetch` + `ReadableStream`, para poder mandar cabeceras y un cuerpo POST).
4. El backend:
   - resuelve o crea la conversación local y la sesión de OpenCode
     (`client.session.create`);
   - si el usuario tiene API key propia, la registra y activa como credencial en el
     servidor de OpenCode;
   - envía el prompt (`client.session.prompt`);
   - escucha el stream **único** de eventos del servidor y reemite los eventos de esa
     sesión.
5. Al terminar, el backend recupera el mensaje final del asistente
   (`client.message.list`), lo guarda en SQLite y emite `done`.
6. La barra lateral y el historial se leen de `GET /api/conversations`.

### Hub de eventos

`backend/src/services/eventHub.js` mantiene **una sola** suscripción SSE al servidor
de OpenCode y reparte los eventos entre todas las peticiones de chat abiertas
(`EventEmitter`). Así 20 usuarios simultáneos no abren 20 conexiones al servidor.
Si el stream se corta, reconecta automáticamente cada 1,5 s.

### Modelo de credenciales

Las credenciales del servidor de OpenCode son **globales** (no por sesión) y se
organizan por *integración* (`opencode`, `opencode-go`, `anthropic`, `openai`, …).
Cuando un usuario define una API key propia, el backend la registra en la integración
elegida (`credential.create` con `activate: true`) justo antes de su petición. La
activación se serializa en una cola (`services/credentials.js`) y se cachea por
usuario. Si la activación falla, el chat sigue funcionando con la credencial del
servidor y avisa con un `warning`.

El botón *verificar* de Ajustes hace una comprobación real: activa la credencial y
lanza una generación mínima (`POST /api/experimental/generate`). Si OpenCode responde
`401`/`403`, la key se rechaza con un mensaje claro; si responde, se marca como
comprobada.

> **Matiz importante:** el servidor de OpenCode decide qué credencial usa cada
> proveedor. Para los proveedores del propio *workspace* (`opencode`, `opencode-go`)
> el servidor puede seguir usando la credencial de su cuenta si ya tiene una activa,
> así que registrar una key ahí no garantiza que la facturación pase a ser tuya. Para
> proveedores de terceros (`anthropic`, `openai`, `deepseek`, …) la credencial sí es
> la que se utiliza.

## Referencia de la API

Todas las rutas devuelven errores con la forma `{ error: { code, message, details? } }`.

### Autenticación

| Método | Ruta | Descripción |
| --- | --- | --- |
| `POST` | `/api/auth/register` | Crea la cuenta. `{ email, password }` → `{ token, user, settings }`. |
| `POST` | `/api/auth/login` | Inicia sesión. |
| `GET` | `/api/auth/me` | Usuario y preferencias actuales. |
| `POST` | `/api/auth/logout` | Borra la cookie de sesión. |

### API keys

| Método | Ruta | Descripción |
| --- | --- | --- |
| `GET` | `/api/keys` | Lista las keys (enmascaradas). |
| `POST` | `/api/keys` | `{ label, provider, key }`. Se cifra antes de guardar. |
| `POST` | `/api/keys/:id/default` | Marca como predeterminada. |
| `POST` | `/api/keys/:id/verify` | Comprueba que OpenCode acepta la credencial. |
| `DELETE` | `/api/keys/:id` | Elimina la key. |

### Chat

| Método | Ruta | Descripción |
| --- | --- | --- |
| `POST` | `/api/chat` | `{ prompt, conversationId?, model?, agent?, skillIds?, images?, apiKeyId? }` → **SSE**. |
| `POST` | `/api/chat/stop` | `{ conversationId }` interrumpe la ejecución en curso. |

Eventos SSE emitidos: `meta`, `delta`, `reasoning`, `tool`, `status`, `error`, `done`.

### Conversaciones

| Método | Ruta | Descripción |
| --- | --- | --- |
| `GET` | `/api/conversations` | Lista por fecha de actualización. |
| `POST` | `/api/conversations` | Crea una conversación vacía. |
| `GET` | `/api/conversations/:id` | Conversación + mensajes. |
| `PATCH` | `/api/conversations/:id` | Renombra. |
| `DELETE` | `/api/conversations/:id` | Borra (también la sesión remota). |

### Modelos, skills y estado

| Método | Ruta | Descripción |
| --- | --- | --- |
| `GET` | `/api/models` | Modelos, agentes y comandos (caché 1 h). |
| `GET` | `/api/models/refresh` | Invalida la caché. |
| `GET` | `/api/skills` | Skills propias (`?content=1` incluye el contenido). |
| `GET` | `/api/skills/available` | Skills registradas en OpenCode. |
| `POST` | `/api/skills` | Multipart (`file`) o JSON `{ name, content }`. |
| `POST` | `/api/skills/install` | `{ url }` descarga y valida la skill. |
| `DELETE` | `/api/skills/:id` | Elimina la skill (registro + archivo). |
| `GET` | `/api/settings` · `PATCH /api/settings` | Preferencias (tema, modelo y agente por defecto). |
| `GET` | `/api/status` | Estado del servidor de OpenCode. |
| `GET` | `/api/status/capabilities` | Modelos, agentes, proveedores y skills del servidor. |
| `GET` | `/api/status/logs` | Últimas líneas del servidor gestionado (diagnóstico). |
| `GET` | `/api/health` | Health check público (sin autenticación). |

## Barra de prompt y comandos

Escribe `/` en la barra para desplegar el submenú:

| Comando | Acción |
| --- | --- |
| `/models` | Muestra el modelo activo; el selector ⌘ permite cambiarlo (con búsqueda). |
| `/skills` | Lista las skills disponibles. |
| `/skills install <url>` | Descarga e instala una skill desde una URL. |
| `/status` | Consulta el estado de la conexión con OpenCode. |
| `/clear` | Limpia el historial local de la conversación. |
| `/help` | Recordatorio de comandos. |

Además: `Enter` envía, `Shift+Enter` inserta salto de línea, `↑`/`↓` navegan por el
submenú, `Tab`/`Enter` seleccionan y `Esc` lo cierra. El botón 📎 adjunta imágenes.

## Skills

Una skill es un archivo Markdown (o JSON) con frontmatter opcional:

```markdown
---
name: resumidor
description: Resume textos largos en tres puntos
---

# Resumidor

Cuando el usuario pida un resumen, devuelve tres viñetas concisas.
```

- Se guardan en `SKILLS_DIR/<user_id>/<nombre>.md` (disco persistente).
- El nombre se normaliza y el archivo se sanea para impedir *path traversal*.
- En el chat se envían al servidor de OpenCode como `skills: [{ id }]`.
- Límites: 256 KB por skill; solo se descargan URLs `http(s)` con contenido textual.

## Simbología matemática

No se usa LaTeX. Los símbolos se escriben directamente en Unicode y se renderizan con
la pila `.message-body` → `--font-math`:

```
f(x) = 2x + 3²        ∑_{i=1}^{n} i = n(n+1)/2      ∫₀^∞ e^{−x} dx = 1
α ≤ β ≠ γ → ∞         ∀ x ∈ ℝ : x² ≥ 0             √2 ≈ 1.41421…
A ⊆ B ∧ B ⊇ A        ¬(p ∨ q) ⇔ ¬p ∧ ¬q            ∇·F = ∂F/∂x + …
```

Se cargan *Noto Sans Math* y *Noto Sans Symbols 2* desde Google Fonts, con alternativas
locales (*STIX Two Math*, *Latin Modern Math*, Symbola, *Cambria Math*, *DejaVu Sans*)
para que no haya huecos aunque la red falle. Probado en Chromium y Firefox sobre Linux;
también incluye `Segoe UI Symbol` como respaldo en Windows/Safari.

## Tests

```bash
npm test              # desde la raíz
npm test --workspace backend
```

Cubre (46 pruebas, `node:test`):

- Cifrado/descifrado de API keys, manipulación de ciphertext y enmascarado.
- Usuarios: normalización de email, hash y verificación de contraseña, duplicados.
- API keys: predeterminada, promoción al borrar, aislamiento entre usuarios.
- Conversaciones y mensajes: orden, cascada y aislamiento entre usuarios.
- Skills: frontmatter, saneado de rutas, actualización y borrado.
- Validación con zod y mapeo de errores HTTP del SDK (401/403/429/500 → 502).
- Integración HTTP real: registro, login, 401 en rutas protegidas, CRUD completo.

## Despliegue en Render

### 1. Prepara el repositorio

```bash
git init
git add .
git commit -m "OpenCode Web Chat"
git branch -M main
git remote add origin git@github.com:<usuario>/<repo>.git
git push -u origin main
```

> `package-lock.json` **debe** estar en el repo: el build usa `npm ci`.

### 2. Crea el servicio en Render

Con el [`render.yaml`](./render.yaml) incluido, en Render entra en
**New → Blueprint**, selecciona el repositorio y acepta. Se crearán:

- Web Service `opencode-web-chat` (Node, plan *starter*).
- Disco persistente `opencode-data` montado en `/data` (1 GB).
- Las variables `JWT_SECRET` y `ENCRYPTION_KEY` generadas automáticamente.

> **Nota:** los discos persistentes requieren plan de pago. En el plan gratuito el
> servicio funciona, pero SQLite, las skills y las subidas se pierden en cada
> despliegue (el plan gratuito tampoco permite `opencode serve` sostenido por el
> límite de horas).

Configuración equivalente si lo creas a mano:

- **Build Command:** `npm ci && npm run build`
- **Start Command:** `node backend/src/index.js`
- **Health Check Path:** `/api/health`

### 3. Configura GitHub Actions

Añade dos secretos en **Settings → Secrets and variables → Actions**:

| Secreto | Dónde encontrarlo |
| --- | --- |
| `RENDER_SERVICE_ID` | Render → tu servicio → URL `srv-XXXX` o *Settings → Deploy Hook*. |
| `RENDER_API_KEY` | Render → *Account Settings → API Keys*. |

Cada `push` a `main` ejecuta `.github/workflows/deploy.yml`: instala dependencias,
corre los tests, compila el frontend, publica el artefacto y dispara el despliegue.

### 4. Primer uso

1. Abre la URL del servicio, crea una cuenta.
2. En **Ajustes → API keys**, pega tu API key de OpenCode (`oc_sk_…`) y pulsa
   *verificar*.
3. En **Ajustes → Servidor**, comprueba que el estado es "Conectado".
4. Chatea. El modelo por defecto se cambia con el selector ⌘ o con `/models`.

## Seguridad

- **API keys cifradas** con AES-256-GCM; la clave se deriva de `ENCRYPTION_KEY` con
  `scrypt`. Nunca se devuelven al frontend (solo `••••<últimos 4>`).
- **Contraseñas** con `bcryptjs` (10 rondas) y validación mínima de 8 caracteres.
- **JWT** firmados con `JWT_SECRET`, 7 días de validez, cookie `httpOnly` en producción.
- **Rate limiting**: 30 req/15 min en auth, 60 req/min en chat, 300 req/min en la API.
- **Validación de entrada** con `zod` en todos los cuerpos de petición.
- **CORS** restringido vía `CORS_ORIGINS`.
- **Imágenes**: solo tipos MIME permitidos y 5 MB máximo, antes de guardarlas o enviarlas.
- **Rutas de skills** saneadas (sin `..`, sin rutas absolutas, extensiones controladas).
- **Cabeceras** `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`.
- **Sin `dangerouslySetInnerHTML`**: el Markdown del modelo se construye como
  elementos React, así que no puede inyectar HTML.

## Decisiones de diseño

El plan original pedía `@opencode-ai/sdk` y `createOpencodeClient`. Esa librería es la
del **OpenCode 1** y su API (`/session`, `/config`) no es compatible con el servidor
**OpenCode 2** instalado aquí (`/api/session`, `/api/model`). Se usó por tanto el
cliente oficial de V2, **`@opencode/client`**, que expone exactamente las operaciones
del plan (`model.list`, `session.create`, `session.prompt`, `event.subscribe`,
`credential.*`). El servicio `backend/src/services/opencodeClient.js` encapsula todo
para que un cambio de SDK no toque las rutas.

Otras decisiones y su motivo:

- **`bcryptjs`** en lugar de `bcrypt`: misma API y algoritmo, sin compilación nativa.
- **`better-sqlite3@12`** (no 13) para mantener compatibilidad con Node 20.
- **`@opencode/cli`** como dependencia npm: en Render basta `npm ci`, sin scripts de
  instalación externos; el backend localiza el binario automáticamente.
- **`output: export` en Next**: el plan fija un único Web Service con
  `node backend/src/index.js`, así que Express sirve el build estático. El chat es
  puramente cliente, por lo que no se pierde nada funcional.
- **SSE sobre `fetch`** en lugar de `EventSource`: permite `POST` y cabecera
  `Authorization`.
- **`.message-body` sin LaTeX**: se aplica la pila de fuentes matemáticas a los
  mensajes para que los símbolos Unicode se vean nítidos.

## Solución de problemas

| Síntoma | Causa y solución |
| --- | --- |
| `Cannot find module 'better-sqlite3'` o `better_sqlite3.node` | npm 11+ bloquea los scripts de instalación. Ejecuta `npm rebuild better-sqlite3` (y `npm install-scripts approve better-sqlite3`). En Node 20 no ocurre. |
| `/api/status` dice "sin conexión" | El servidor no arrancó. Mira `GET /api/status/logs` y comprueba que el binario existe (`OPENCODE_BIN`). |
| "API key inválida" al chatear | La credencial caducó o no tiene permiso. Verifícala en Ajustes o cambia de modelo. |
| Los símbolos matemáticos salen como cuadros | La fuente no cargó (sin red). El sistema usará las alternativas locales; instala *Noto Sans Math* o *Symbols* en el sistema. |
| Los datos desaparecen tras desplegar | Estás en el plan gratuito de Render: los discos persistentes requieren plan de pago. |
| `npm ci` falla en CI | Falta `package-lock.json` en el repositorio. |

## Limitaciones conocidas

- Las credenciales del servidor de OpenCode son globales: con varios usuarios
  concurrentes usando API keys distintas, la activación se serializa y podría no
  coincidir con la credencial exacta en el instante de la petición. El chat nunca
  falla por esto (hay respaldo con la credencial del servidor).
- Para los proveedores del propio *workspace* (`opencode`, `opencode-go`), OpenCode
  puede seguir usando la credencial de su cuenta aunque registres una key propia: el
  servidor decide la credencial por proveedor. Con proveedores de terceros la key del
  usuario sí se usa.
- `/api/models` devuelve la lista del servidor; no filtra por los permisos de cada API
  key del usuario.
- El plan gratuito de Render no permite discos persistentes ni procesos de larga
  duración, así que para producción se recomienda el plan *starter*.

---

Licencia: MIT.

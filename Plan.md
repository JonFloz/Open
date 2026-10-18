# Plan de Proyecto: OpenCode Web Chat

## 1. Objetivo General
Construir una aplicación web tipo chat (estilo DeepSeek/Gemini) que permita interactuar con la API de OpenCode desde cualquier navegador, sin necesidad de usar la terminal o la laptop. La aplicación debe gestionar usuarios, almacenar sus API keys, soportar comandos de la CLI de OpenCode (skills, modelos, etc.), renderizar simbología matemática y desplegarse automáticamente en Render mediante GitHub Actions.

## 2. Stack Tecnológico Seleccionado

### Frontend
- **Framework:** **Next.js (React)** con **Tailwind CSS**.
  - *Justificación:* Next.js ofrece enrutamiento sencillo, renderizado híbrido (SSR/SSG) y excelente integración con Tailwind para lograr un diseño responsive y moderno similar a DeepSeek/Gemini.
- **Lenguaje:** TypeScript (tipado fuerte, menos errores en la integración con el SDK de OpenCode).
- **Manejo de Estado:** Zustand o React Context (para estado del chat, prompts y preferencias).
- **Renderizado de Símbolos:** **Unicode nativo** + fuentes *Noto Sans Math* y *Symbola* para garantizar visualización de símbolos matemáticos (∑, ∫, √, ±, ≠, ≤, ≥, →, ∞, etc.) **sin LaTeX**.

### Backend
- **Runtime:** **Node.js (v20 LTS)** con **Express.js**.
  - *Justificación:* Minimalista, fácil de integrar con el SDK de OpenCode y con middlewares de autenticación JWT y rutas de API.
- **Base de Datos:** **SQLite** (`better-sqlite3`, operaciones síncronas y rápidas).
- **Autenticación:** **JWT** (`jsonwebtoken`) + hash de contraseñas con `bcrypt`.
- **Integración OpenCode:** `@opencode-ai/sdk` (SDK oficial TypeScript/JavaScript).
- **Almacenamiento de Archivos:** Disco persistente de Render montado en `/data` (SQLite, skills subidas, cachés, uploads).

### Despliegue e Infraestructura
- **Plataforma:** **Render** (Web Service con disco persistente).
- **CI/CD:** **GitHub Actions** disparado en cada push a `main`, que construye el proyecto y activa el despliegue en Render vía API/CLI.
- **Variables de Entorno:** Gestionadas en Render (`JWT_SECRET`, `ENCRYPTION_KEY`, `OPENCODE_BASE_URL`, etc.).

## 3. Arquitectura de la Aplicación

### 3.1. Estructura de Carpetas (Monorepo)

~~~text
opencode-web-chat/
├── frontend/          # Next.js (React + Tailwind)
│   ├── src/
│   │   ├── app/
│   │   ├── components/ # Chat, PromptBar, Sidebar, etc.
│   │   ├── lib/       # utilidades, hooks, cliente API
│   │   └── styles/    # Tailwind y fuentes matemáticas
│   └── package.json
├── backend/           # Express.js
│   ├── src/
│   │   ├── routes/    # auth, chat, models, skills, keys
│   │   ├── middleware/ # authJWT, errorHandler, rateLimiter
│   │   ├── db/        # sqlite.js, migraciones
│   │   ├── services/  # opencodeClient, skillManager, crypto
│   │   └── index.js
│   └── package.json
├── .github/workflows/deploy.yml
├── render.yaml        # definición del servicio y disco persistente
└── plan.md
~~~

### 3.2. Flujo de Datos
1. El usuario se registra/loguea en el frontend (Next.js).
2. El backend valida credenciales, emite un JWT y lo devuelve.
3. El frontend almacena el JWT (cookie httpOnly o localStorage) y lo envía en cada petición.
4. Para chatear, el frontend envía el prompt (y adjuntos) al backend.
5. El backend, usando el SDK de OpenCode y la API key del usuario (almacenada en SQLite), realiza la petición al servidor de OpenCode.
6. La respuesta se devuelve al frontend (se valorará streaming si el SDK lo permite).
7. Los comandos `/models`, `/skills`, etc., se manejan en el frontend mostrando un submenú; el backend resuelve la información necesaria (lista de modelos, skills disponibles).

## 4. Funcionalidades Detalladas

### 4.1. Autenticación (Login/Register)
- Endpoints: `POST /api/auth/register`, `POST /api/auth/login`.
- Validación de email y contraseña (mínimo 8 caracteres).
- Hash con `bcrypt` (10 rondas).
- JWT con expiración de 7 días, firmado con `JWT_SECRET`.
- Middleware `authJWT` para proteger rutas privadas.
- Frontend: formularios sencillos con validación en cliente, manejo de errores y persistencia del token.

### 4.2. Gestión de API Keys de OpenCode
- Cada usuario puede guardar una o varias API keys (distintos planes/proveedores).
- Endpoints: `POST /api/keys`, `GET /api/keys`, `DELETE /api/keys/:id`.
- Almacenamiento en SQLite (tabla `api_keys` con `user_id`, `key_encrypted`, `provider`, `created_at`).
- Las keys se cifran en reposo con `crypto.createCipheriv` usando una clave derivada de `ENCRYPTION_KEY`.
- La API key activa se selecciona en la UI y se envía al backend en cada petición de chat (o se guarda como preferencia del usuario).

### 4.3. Chat con OpenCode
- **Barra de Prompt Avanzada:**
  - Soporte para texto multilínea, adjuntar imágenes (base64 o subida a `/data/uploads`).
  - Al escribir `/`, se despliega un submenú con:
    - `/models`: lista los modelos disponibles (obtenidos vía SDK usando la API key del usuario).
    - `/skills`: lista las skills instaladas/disponibles.
    - `/skills install <url>`: instala una skill desde una URL.
    - `/status`: muestra el estado de la conexión con OpenCode.
    - `/clear`: limpia el historial local de la conversación.
  - Historial del chat mantenido en el estado del frontend y persistido en SQLite (`conversations`, `messages`).
- **Backend:**
  - Endpoint `POST /api/chat` que recibe `{ prompt, images, model, skill }`.
  - Usa `createOpencodeClient` con la `baseUrl` del servidor de OpenCode y la API key del usuario.
  - Llama a `client.session.prompt()` con las partes correspondientes (texto, imágenes, etc.).
  - Maneja errores HTTP de OpenCode (401, 429, 500) y los propaga con mensajes claros.
  - Si el SDK soporta streaming, se implementará con Server-Sent Events (SSE) para experiencia tipo ChatGPT.

### 4.4. Lista de Modelos Dinámica
- Endpoint `GET /api/models` (protegido).
- Usa el SDK de OpenCode para obtener los modelos disponibles según la API key del usuario (`client.models.list()` o equivalente).
- Caché en memoria/SQLite durante 1 hora para evitar llamadas excesivas.
- Si la API key no tiene permiso o falla, devuelve `401/403` con mensaje descriptivo.
- El frontend muestra los modelos en el submenú `/models` y permite seleccionar uno para la conversación.

### 4.5. Gestión de Skills
- Las skills son archivos markdown (o JSON) que definen comandos personalizados.
- **Subida/Creación:**
  - `POST /api/skills` (multipart/form-data) para subir `.md` o `.json`.
  - Los archivos se guardan en `/data/skills/<user_id>/`.
  - `POST /api/skills/install` recibe una URL y descarga la skill validando que sea texto.
- **Listado:** `GET /api/skills` devuelve las skills del usuario leyendo `/data/skills/<user_id>/`.
- **Uso en el chat:** al seleccionar una skill en el submenú, se envía su contenido como parte del prompt o como parámetro adicional al SDK (según cómo OpenCode maneje skills; se valida en la doc del SDK).
- **Persistencia:** el disco persistente de Render garantiza que las skills sobreviven a reinicios y despliegues.

### 4.6. Soporte de Simbología Matemática y Otras Ramas
- Fuente **Noto Sans Math** (o similar) configurada en CSS global para asegurar que todos los símbolos Unicode se rendericen correctamente.
- Sin LaTeX; representación Unicode nativa (ej: `f(x) = 2x + 3²`, `∑_{i=1}^{n} i`, `∫₀^∞ e^{-x} dx`).
- Pruebas con amplia gama de símbolos (matemáticos, griegos, flechas, operadores lógicos) en Chrome, Firefox y Safari.

### 4.7. Diseño UI/UX (Responsive)
- Interfaz de dos paneles: barra lateral colapsable con historial de conversaciones y panel principal de chat.
- Estilo similar a DeepSeek/Gemini: fondo oscuro/claro, burbujas de mensaje, avatares y barra de prompt fija inferior.
- Totalmente responsive: en móviles la barra lateral se oculta y se accede mediante un botón de menú.
- Tailwind CSS para utilidades y componentes personalizados.
- Selector de tema (claro/oscuro) con persistencia de preferencias.

## 5. Integración con OpenCode

### 5.1. SDK y Configuración
- Instalar `@opencode-ai/sdk`.
- Servicio backend (`services/opencodeClient.js`):
  - Recibe la API key del usuario y la `baseUrl` del servidor de OpenCode (`http://localhost:4096` por defecto).
  - Devuelve un cliente configurado con `createOpencodeClient`.
- **Nota crítica:** si el SDK solo funciona contra un servidor local, se ejecutará `opencode serve` como proceso hijo dentro del mismo servicio de Render, y el backend se conectará a `http://localhost:4096`. Se valida durante el desarrollo.

### 5.2. Manejo de Estados HTTP
- El backend capturará errores del SDK (`try/catch`) y mapeará códigos:
  - `401`: API key inválida o expirada → devolver `401` con mensaje "API key inválida".
  - `403`: Sin permisos para el modelo solicitado → devolver `403`.
  - `429`: Límite de tasa excedido → devolver `429` con `Retry-After`.
  - `500`: Error interno de OpenCode → devolver `502` (Bad Gateway) con mensaje genérico.
- El frontend mostrará estos errores en un toast o banner.

## 6. Despliegue en Render

### 6.1. Configuración del Servicio
- Crear un **Web Service** en Render conectado al repositorio de GitHub.
- **Build Command:** `npm install && npm run build`.
- **Start Command:** `node backend/src/index.js`.
- **Disco Persistente:** mount path `/data`, tamaño 1 GB (SQLite, skills y uploads).
- **Variables de Entorno:**
  - `JWT_SECRET`: generado aleatoriamente.
  - `ENCRYPTION_KEY`: clave para cifrar API keys.
  - `DATABASE_PATH`: `/data/opencode.db`.
  - `SKILLS_DIR`: `/data/skills`.
  - `UPLOADS_DIR`: `/data/uploads`.
  - `OPENCODE_BASE_URL`: `http://localhost:4096` (o URL remota si aplica).
  - `PORT`: inyectado por Render (`process.env.PORT`).

### 6.2. GitHub Actions (deploy.yml)
- Workflow disparado en `push` a `main`.
- Pasos:
  1. Checkout del código.
  2. Configurar Node.js v20.
  3. Instalar dependencias y ejecutar pruebas (si existen).
  4. Construir el frontend (`npm run build`).
  5. Desplegar en Render usando la **Render API** (secreto `RENDER_API_KEY` + `RENDER_SERVICE_ID`).

Ejemplo del archivo YAML:
~~~yaml
name: Deploy to Render
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run build
      - name: Trigger Render Deploy
        run: |
          curl -X POST "https://api.render.com/deploy/srv-${{ secrets.RENDER_SERVICE_ID }}?key=${{ secrets.RENDER_API_KEY }}"
~~~
- `RENDER_SERVICE_ID` y `RENDER_API_KEY` se guardan como secretos en GitHub.

## 7. Seguridad y Mejoras Adicionales
- **Cifrado de API Keys:** cifrado en SQLite con `crypto.createCipheriv` y `ENCRYPTION_KEY`.
- **Validación de Entradas:** `express-validator` o `zod` en todas las rutas (prompt, email, etc.).
- **Rate Limiting:** `express-rate-limit` en endpoints de auth y chat.
- **CORS:** restringido al dominio del frontend en producción.
- **Logs:** `morgan` o `pino` (sin exponer datos sensibles).
- **Health Check:** `GET /api/health` para monitoreo en Render.
- **Manejo de Imágenes:** límite de 5 MB y validación de tipos MIME antes de almacenar o enviar al SDK.
- **Persistencia de Historial:** tablas `conversations` (id, user_id, title, created_at) y `messages` (id, conversation_id, role, content, created_at).

## 8. Fases de Desarrollo (Checklist)
1. [x] Configurar monorepo (frontend Next.js + backend Express).
2. [x] Implementar autenticación JWT (registro, login, middleware).
3. [x] Crear esquema SQLite y capa de acceso a datos (usuarios, api_keys, conversaciones).
4. [x] Integrar SDK de OpenCode en el backend y probar conexión con `opencode serve` local.
5. [x] Desarrollar endpoints de chat, modelos y skills.
6. [x] Construir UI del chat (barra de prompt, submenú `/`, renderizado de mensajes).
7. [x] Implementar subida y listado de skills (disco persistente).
8. [x] Añadir soporte de simbología matemática (fuentes y pruebas).
9. [x] Configurar despliegue en Render (disco persistente, variables de entorno) y GitHub Actions.
10. [x] Pruebas integrales (flujo de usuario completo, manejo de errores HTTP).
11. [x] Documentación final (README con instrucciones de despliegue y uso).

> Estado: las 11 fases están completadas. Ver `README.md` para instrucciones de
> instalación, uso y despliegue, y la sección «Decisiones de diseño» para los ajustes
> respecto a este plan (cliente de OpenCode V2 en lugar del SDK de V1).

## 9. Riesgos y Mitigaciones
- **El SDK de OpenCode requiere un servidor local:** si no permite conexión remota, ejecutar `opencode serve` como proceso hijo en el mismo contenedor de Render, con el puerto 4096 disponible internamente.
- **Límites de Render Free Tier:** optimizar uso de memoria y recomendar el plan adecuado si es necesario.
- **Compatibilidad de símbolos Unicode:** probar en Chrome, Firefox y Safari con fallback de fuentes.
- **Manejo de imágenes en el prompt:** consultar la doc del SDK para el tipo `Part` correcto (base64 o URL).

## 10. Conclusión
Este plan cubre todos los requisitos funcionales y técnicos para construir un chat web completo con OpenCode, listo para desplegarse en Render de forma automatizada. La selección de Next.js + Express + SQLite + SDK oficial garantiza desarrollo ágil e integración fiable. Una vez finalizado, el proyecto estará listo para subirse a GitHub y activar el workflow.

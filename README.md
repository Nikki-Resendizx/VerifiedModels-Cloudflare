# VerifiedModels Cloudflare

Bot VerifiedModels adaptado a Cloudflare Workers.

Arquitectura:
Telegram -> Cloudflare Worker -> Telegraf -> Firebase Firestore REST

No usa polling ni un servidor Node permanente.

Configura:
BOT_TOKEN
FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY
ADMIN_IDS
WEBAPP_URL
CANAL_ID
CANAL_FREE_URL
WEBHOOK_URL
WEBHOOK_SECRET
SETUP_SECRET

Primer despliegue:
1. Conecta el repositorio con Cloudflare Workers.
2. Haz Deploy.
3. Define WEBHOOK_URL con la URL del Worker terminada en /telegram.
4. Define SETUP_SECRET.
5. Abre /set-webhook?secret=TU_SETUP_SECRET.
6. Comprueba /health.

Telegram Storage conserva siete temas:
bienvenida, plantillas, galeria, botones, admins, usuarios y modelos.

Para vincular un Topic:
 /vincular bienvenida
 /vincular plantillas
 /vincular galeria
 /vincular botones
 /vincular admins
 /vincular usuarios
 /vincular modelos

El bot de Render permanece independiente.

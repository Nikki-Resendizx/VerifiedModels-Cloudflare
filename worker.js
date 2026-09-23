const { Telegraf } = require('telegraf');
const { registerHandlers } = require('./src/handlers');

let botPromise;

async function getBot() {
  if (!botPromise) {
    botPromise = (async () => {
      const token = process.env.BOT_TOKEN;
      if (!token) throw new Error('Falta BOT_TOKEN');
      const bot = new Telegraf(token);
      registerHandlers(bot);
      bot.catch((err, ctx) => console.error('Telegram update error', ctx?.updateType, err));
      return bot;
    })();
  }
  return botPromise;
}

async function telegram(method, body) {
  const token = process.env.BOT_TOKEN;
  const r = await fetch('https://api.telegram.org/bot' + token + '/' + method, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  const data = await r.json();
  if (!data.ok) throw new Error(data.description || 'Telegram API error');
  return data.result;
}

const worker = {
  async fetch(request, env) {
    globalThis.__verifiedmodelsEnv = env;
    const url = new URL(request.url);

    if (request.method === 'GET') {
      if (url.pathname === '/health') {
        return Response.json({ ok: true, service: 'verifiedmodels-cloudflare' });
      }
      if (url.pathname === '/set-webhook') {
        if (!process.env.SETUP_SECRET || url.searchParams.get('secret') !== process.env.SETUP_SECRET) {
          return new Response('Unauthorized', { status: 401 });
        }
        const webhookUrl = process.env.WEBHOOK_URL || url.origin + '/telegram';
        const body = { url: webhookUrl, drop_pending_updates: true };
        if (process.env.WEBHOOK_SECRET) body.secret_token = process.env.WEBHOOK_SECRET;
        const result = await telegram('setWebhook', body);
        return Response.json({ ok: true, webhookUrl, result });
      }
      if (url.pathname === '/delete-webhook') {
        if (!process.env.SETUP_SECRET || url.searchParams.get('secret') !== process.env.SETUP_SECRET) {
          return new Response('Unauthorized', { status: 401 });
        }
        const result = await telegram('deleteWebhook', { drop_pending_updates: true });
        return Response.json({ ok: true, result });
      }
      return new Response('VerifiedModels Cloudflare Worker online');
    }

    if (url.pathname !== '/telegram') return new Response('Not found', { status: 404 });
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

    const secret = process.env.WEBHOOK_SECRET;
    if (secret && request.headers.get('x-telegram-bot-api-secret-token') !== secret) {
      return new Response('Unauthorized', { status: 401 });
    }

    try {
      const update = await request.json();
      const bot = await getBot();
      await bot.handleUpdate(update);
      return new Response('OK');
    } catch (error) {
      console.error('Webhook error:', error);
      return new Response('OK');
    }
  }
};

export default worker;

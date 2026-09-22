const { Markup } = require('telegraf');
const { saveUser, getUser, getConfig, getBotMedia } = require('../config/db');
const { publishTextToStorage } = require('../storage');
const { replaceVars } = require('../utils');
const { webAppButton, urlButton, button } = require('../buttons');

module.exports = bot => bot.start(async ctx => {
  const from = ctx.from || {};

  // /start debe responder aunque Firebase, una foto o una configuración opcional fallen.
  try {
    try {
      const previous = await getUser(from.id);
      await saveUser(from.id, {
        username: from.username || '',
        first_name: from.first_name || '',
        last_name: from.last_name || ''
      });

      // Aviso solo cuando el usuario es realmente nuevo.
      if (!previous) {
        try {
          await publishTextToStorage(
            ctx.telegram,
            'usuarios',
            '👤 NUEVO USUARIO\n' +
            '🆔 ID: ' + String(from.id) + '\n' +
            '👤 Nombre: ' + String([from.first_name, from.last_name].filter(Boolean).join(' ') || 'Sin nombre') + '\n' +
            '🔗 Username: ' + (from.username ? '@' + from.username : 'Sin username'),
            {}
          );
        } catch (storageError) {
          console.error('START: aviso Storage usuarios:', storageError.message || storageError);
        }
      }
    } catch (e) {
      console.error('START: error guardando usuario:', e);
    }

    let config = {};
    let media = {};

    try {
      config = await getConfig();
    } catch (e) {
      console.error('START: error leyendo configuración:', e);
    }

    try {
      media = await getBotMedia();
    } catch (e) {
      console.error('START: error leyendo media:', e);
    }

    const template = config.bienvenida_texto ||
      '👋 ¡Hola {mencion}! 💎\n\nBienvenid@ a VerifiedModels ✨';

    let text = template;
    try {
      text = replaceVars(template, ctx);
      // Si el texto fue guardado desde Telegram con un emoji Premium,
      // lo reconstruimos como tg-emoji para que Telegram lo renderice.
      if (config.bienvenida_emoji_premium && !text.includes('<tg-emoji')) {
        const marker = '💎';
        if (text.includes(marker)) {
          text = text.replace(
            marker,
            '<tg-emoji emoji-id="' + String(config.bienvenida_emoji_premium) + '">' + marker + '</tg-emoji>'
          );
        }
      }
    } catch (e) {
      console.error('START: error reemplazando variables:', e);
      text = template;
    }

    // Construimos el teclado de forma independiente para que un botón mal configurado
    // nunca impida enviar la bienvenida.
    const rows = [];

    if (process.env.WEBAPP_URL) {
      try {
        rows.push([await webAppButton('webapp', process.env.WEBAPP_URL, { section: 'inicio' })]);
      } catch (e) {
        console.error('START: error botón WebApp:', e);
      }
    }

    try {
      rows.push([await button('modelos', { section: 'inicio', style: 'danger' })]);
    } catch (e) {
      console.error('START: error botón modelos:', e);
      rows.push([{ text: '👑 Lista de Modelos 👑', callback_data: 'public_modelos' }]);
    }

    if (process.env.CANAL_FREE_URL) {
      try {
        rows.push([await urlButton('canal_free', process.env.CANAL_FREE_URL, { section: 'inicio', style: 'success' })]);
      } catch (e) {
        console.error('START: error botón canal:', e);
      }
    }

    const extra = rows.length ? { ...Markup.inlineKeyboard(rows) } : {};

    // Primero intentamos enviar la fotografía almacenada en Telegram.
    if (media.bienvenida) {
      try {
        return await ctx.replyWithPhoto(media.bienvenida, {
          caption: text,
          parse_mode: 'HTML',
          ...extra
        });
      } catch (e) {
        console.error('START: error enviando foto; se intentará texto:', e);
      }
    }

    // Fallback definitivo: texto sin parse_mode ni teclado.
    // Así /start sigue funcionando incluso con HTML, botones o configuración inválida.
    try {
      return await ctx.reply(text, {
        parse_mode: 'HTML',
        ...extra
      });
    } catch (e) {
      console.error('START: error enviando bienvenida HTML:', e);
      return ctx.reply(String(text).replace(/<[^>]*>/g, ''));
    }
  } catch (error) {
    console.error('START: error inesperado:', error);
    try {
      return await ctx.reply('👋 ¡Hola! Bienvenid@ a VerifiedModels ✨');
    } catch (e) {
      console.error('START: no se pudo enviar ni el fallback:', e);
    }
  }
});
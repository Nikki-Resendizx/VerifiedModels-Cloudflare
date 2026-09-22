const { getModelos, getModelo, voteModelo, getModelBotMedia } = require('../config/db');
const { getConfig } = require('../cache');
const { escapeHtml, replaceVars } = require('../utils');
const { Markup } = require('telegraf');
const { button, urlButton, webAppButton } = require('../buttons');

function getModelName(m) {
  return m.perfil || m.nombre || m.username || 'Modelo';
}

// Telegram no permite fijar un ancho CSS a los botones inline.
// Limitamos el texto y usamos una columna para que la fila nunca se expanda
// más que el ancho disponible de la foto/caption en los clientes de Telegram.
function getButtonModelName(m) {
  const name = String(getModelName(m)).trim();
  return name.length > 22 ? name.slice(0, 21).trimEnd() + '…' : name;
}

async function sendLista(ctx) {
  let config = {};
  try {
    config = await getConfig();
  } catch (e) {
    console.error('LISTA: error cargando configuración:', e.message || e);
  }

  let list;
  try {
    list = await getModelos();
  } catch (e) {
    console.error('LISTA: error cargando modelos desde Firestore:', e.message || e);
    return ctx.reply('❌ No pude leer los modelos desde la base de datos. Revisa Firestore/credenciales en Render.');
  }

  if (!list.length) {
    return ctx.reply('⏳ Aún no hay modelos');
  }

  // Mantener el orden más reciente primero cuando existe "fecha".
  list.sort((a, b) => {
    const da = a.fecha?.toDate ? a.fecha.toDate().getTime() : new Date(a.fecha || 0).getTime();
    const db = b.fecha?.toDate ? b.fecha.toDate().getTime() : new Date(b.fecha || 0).getTime();
    return db - da;
  });

  const template = config.galeria_texto || '👑 GALERÍA {mencion}\nElige una chica 👇';
  const texto = replaceVars(template, ctx);
  const keyboard = [];
  let row = [];

  for (let index = 0; index < list.length; index++) {
    const m = list[index];
    const style = index % 2 === 0 ? 'primary' : 'danger';

    const btn = {
      text: getButtonModelName(m),
      callback_data: 'ver_' + m.id,
      style
    };

    if (config.galeria_emoji_premium) {
      btn.icon_custom_emoji_id = String(config.galeria_emoji_premium);
    }

    try {
      const custom = await button('emoji_listado', { section: 'galeria' });
      if (custom.icon_custom_emoji_id) btn.icon_custom_emoji_id = custom.icon_custom_emoji_id;
      // Only use a custom label when it is actually configured. Never replace
      // the model name with a generic default/button key.
      if (custom.text && custom.text !== 'emoji_listado' && custom.text !== '✨') {
        btn.text = String(custom.text).replace('{perfil}', getModelName(m));
      }
    } catch (_) {}

    // Conservamos 2 botones por fila, limitando el nombre para que cada
    // botón permanezca compacto y no provoque filas demasiado anchas.
    row.push(btn);

    if (row.length === 2) {
      keyboard.push(row);
      row = [];
    }
  }

  if (row.length) keyboard.push(row);

  // Botones inferiores: conservamos la configuración actual y también
  // aceptamos la estructura antigua del bot de Vercel.
  const legacyGallery = config.botones?.galeria || {};
  const canal = legacyGallery.canal_oficial || {};
  const web = legacyGallery.galeria_virtual || {};

  const canalUrl = canal.url || process.env.CANAL_FREE_URL || process.env.CANAL_OFICIAL_URL || '';
  const webUrl = process.env.WEBAPP_URL || '';

  try {
    if (canalUrl) {
      keyboard.push([await urlButton('canal_oficial', canalUrl, { section: 'galeria', style: canal.style || 'success' })]);
    }
    if (webUrl) {
      keyboard.push([await webAppButton('webapp', webUrl, { section: 'galeria', style: 'primary' })]);
    }
    keyboard.push([
      await button('volver', { section: 'galeria', callback_data: 'public_modelos' }),
      await button('inicio', { section: 'galeria', callback_data: 'inicio' })
    ]);
  } catch (e) {
    console.error('LISTA: error creando botones inferiores:', e.message || e);
    keyboard.push([
      { text: '↩️ Volver', callback_data: 'public_modelos', style: 'primary' },
      { text: '🏠 Inicio', callback_data: 'inicio', style: 'primary' }
    ]);
  }

  const markup = { reply_markup: { inline_keyboard: keyboard } };

  // Telegram puede rechazar una keyboard si una cuenta/bot todavía no
  // admite alguna propiedad avanzada (style o custom emoji). En ese caso
  // no debemos dejar caer toda la lista: reintentamos con botones estándar.
  const safeKeyboard = keyboard.map(row => row.map(btn => {
    const safe = { text: String(btn.text || ''), callback_data: btn.callback_data };
    if (btn.url) { delete safe.callback_data; safe.url = btn.url; }
    if (btn.web_app) { delete safe.callback_data; safe.web_app = btn.web_app; }
    return safe;
  }));
  const safeMarkup = { reply_markup: { inline_keyboard: safeKeyboard } };

  const media = config.galeria_media || config.galeria_media_file_id || config.galeria_media_url || '';

  if (media) {
    try {
      return await ctx.replyWithPhoto(media, {
        caption: texto,
        parse_mode: 'HTML',
        ...markup
      });
    } catch (e) {
      console.error('LISTA: error enviando foto/keyboard avanzada:', e.message || e);
      try {
        return await ctx.replyWithPhoto(media, {
          caption: texto,
          parse_mode: 'HTML',
          ...safeMarkup
        });
      } catch (fallbackError) {
        console.error('LISTA: error enviando foto/keyboard estándar:', fallbackError.message || fallbackError);
      }
    }
  }

  try {
    return await ctx.reply(texto, {
      parse_mode: 'HTML',
      ...markup
    });
  } catch (e) {
    console.error('LISTA: error enviando keyboard avanzada:', e.message || e);
    try {
      return await ctx.reply(texto, {
        parse_mode: 'HTML',
        ...safeMarkup
      });
    } catch (fallbackError) {
      console.error('LISTA: error HTML en galería, enviando texto plano:', fallbackError.message || fallbackError);
      // Último recurso: un texto plano siempre permite mostrar la lista
      // aunque la configuración de formato HTML esté mal escrita.
      const plainText = String(texto || '').replace(/<[^>]*>/g, '');
      return ctx.reply(plainText, safeMarkup);
    }
  }
}

async function sendModelo(ctx, id) {
  const model = await getModelo(id);

  if (!model) {
    return ctx.reply('❌ Modelo no existe');
  }

  const config = await getConfig();
  let plantilla = config.plantilla_texto ||
    '👑 {perfil} 👑\n@{username}\n{edad} | {nacionalidad}\n\n{Lista_servicios}\n\n{descripcion}\n\n{Votos} votos | {porcentaje_buenos}% buenos';

  // Si existe una plantilla activa, esta tiene prioridad y permite
  // intercambiar el estilo sin tocar cada modelo.
  if (config.plantilla_activa) {
    try {
      const { getPlantillas } = require('../config/db');
      const plantillas = await getPlantillas();
      if (plantillas[config.plantilla_activa]?.texto) {
        plantilla = plantillas[config.plantilla_activa].texto;
      }
    } catch (e) {
      console.error('MODELO: error cargando plantilla activa:', e.message || e);
    }
  }

  const texto = replaceVars(plantilla, ctx, model);
  const media = await getModelBotMedia(id);
  const fileId = media?.file_id;

  const buttons = [
    [await webAppButton('perfil_webapp', (process.env.WEBAPP_URL || '') + '?startapp=m_' + encodeURIComponent(id), { section: 'plantilla', style: 'primary' })],
    [
      await button('votosbueno', { section: 'plantilla', callback_data: 'voto_bueno:' + id, style: 'success' }),
      await button('votosmalos', { section: 'plantilla', callback_data: 'voto_malo:' + id, style: 'danger' })
    ]
  ];

  const canalUrlModel = model.canalFree || model.canal_free || process.env.CANAL_FREE_URL || '';
  const contactoUrlModel = model.contacto || (model.username ? 'https://t.me/' + String(model.username).replace(/^@/, '') : '');
  const contactRow = [];
  if (canalUrlModel) contactRow.push(await urlButton('canal_free', canalUrlModel, { section: 'plantilla', style: 'primary' }));
  if (contactoUrlModel) contactRow.push(await urlButton('contactar', contactoUrlModel, { section: 'plantilla', style: 'primary' }));
  if (contactRow.length) buttons.push(contactRow);

  buttons.push([
    await button('volver', { section: 'plantilla', callback_data: 'public_modelos', style: 'primary' }),
    await button('inicio', { section: 'plantilla', callback_data: 'inicio', style: 'primary' })
  ]);

  const markup = Markup.inlineKeyboard(buttons);

  if (fileId) {
    try {
      return await ctx.replyWithPhoto(fileId, {
        caption: texto,
        parse_mode: 'HTML',
        ...markup
      });
    } catch (e) {
      console.error('MODELO: error enviando foto:', e.message || e);
    }
  }

  return ctx.reply(texto, {
    parse_mode: 'HTML',
    ...markup
  });
}

const registerModelos = bot => {
  // Lista: ya no envía todas las modelos juntas.
  // Primero muestra botones de 2 en 2 y solo carga la modelo seleccionada.
  bot.command('modelos', async ctx => {
    try {
      return await sendLista(ctx);
    } catch (e) {
      console.error('Error lista modelos:', e);
      return ctx.reply('❌ No pude cargar la lista de modelos.');
    }
  });

  bot.action('public_modelos', async ctx => {
    await ctx.answerCbQuery().catch(() => {});
    try { await ctx.deleteMessage().catch(() => {}); } catch (_) {}
    try {
      return await sendLista(ctx);
    } catch (e) {
      console.error('LISTA: fallo final en public_modelos:', e.message || e);
      return ctx.reply('❌ No pude cargar la lista de modelos. Usa /modelos para reintentar.');
    }
  });

  // Compatibilidad con el diseño del bot Vercel.
  bot.action('lista', async ctx => {
    await ctx.answerCbQuery().catch(() => {});
    try { await ctx.deleteMessage().catch(() => {}); } catch (_) {}
    try {
      return await sendLista(ctx);
    } catch (e) {
      console.error('LISTA: fallo final en lista:', e.message || e);
      return ctx.reply('❌ No pude cargar la lista de modelos. Usa /modelos para reintentar.');
    }
  });

  bot.action(/^ver_(.+)$/, async ctx => {
    await ctx.answerCbQuery().catch(() => {});
    try {
      await ctx.deleteMessage().catch(() => {});
    } catch (e) {}
    return sendModelo(ctx, ctx.match[1]);
  });

  bot.action(/^voto_(bueno|malo):(.+)$/, async ctx => {
    try {
      const type = ctx.match[1];
      const id = ctx.match[2];
      const n = await voteModelo(id, type);
      const modelAfter = await getModelo(id);

      await ctx.answerCbQuery(type === 'bueno' ? '👍 Voto registrado' : '👎 Voto registrado');

      const bueno = Number(modelAfter?.votosBueno || 0);
      const malo = Number(modelAfter?.votosMalo || 0);
      const total = bueno + malo;
      const emoji = type === 'bueno' ? '👍🏻' : '👎🏻';
      const tipoTexto = type === 'bueno' ? 'BUENO' : 'MALO';
      const username = ctx.from?.username ? '@' + ctx.from.username : 'ID:' + String(ctx.from?.id || '?');
      const canalId = process.env.CANAL_ID || '-1004377732507';

      try {
        await ctx.telegram.sendMessage(
          canalId,
          emoji + ' VOTO ' + tipoTexto + '\n' +
          '👑 ' + String(modelAfter?.perfil || id) + ' (@' + String(modelAfter?.username || '').replace(/^@/, '') + ')\n' +
          '📊 Total: ' + total + '\n' +
          '👤 ' + username + ' ID:' + String(ctx.from?.id || '?')
        );
      } catch (notifyError) {
        console.error('Error avisando voto al canal:', notifyError.message || notifyError);
      }

      return ctx.reply(
        emoji + ' Voto registrado. Total de este tipo: ' + n + '\n' +
        '📊 Total de votos: ' + total
      );
    } catch (e) {
      console.error('Error voto bot:', e);
      return ctx.answerCbQuery('No se pudo registrar el voto', { show_alert: true });
    }
  });
};

registerModelos.sendLista = sendLista;
registerModelos.sendModelo = sendModelo;

module.exports = registerModelos;

const { Markup } = require('telegraf');
const {
  isAdmin, escapeHtml
} = require('../utils');
const {
  getPlantillas, getModelos, getBotMedia, getUsers, getConfig, getStorage,
  getButtonConfig, saveButtonConfig, saveConfig,
  deletePlantilla, deleteModelo, resetModeloVotes,
  saveBotMedia, deleteBotMedia, deleteModelBotMedia
} = require('../config/db');
const { publishPhotoToStorage, publishTextToStorage } = require('../storage');
const { prepararTextoTelegram } = require('../utils');

const pending = new Map();

function b(text, callback_data, style = 'primary') {
  return { text, callback_data, style };
}

function kb(rows) {
  return Markup.inlineKeyboard(rows);
}

const panelKeyboard = () => kb([
  [b('👋 BIENVENIDA', 'adm_bienvenida', 'danger'), b('📝 PLANTILLAS', 'adm_plantillas', 'danger')],
  [b('🖼️ GALERÍA', 'adm_galeria', 'primary'), b('👸 MODELOS', 'adm_modelos', 'primary')],
  [b('👑 ADMINS', 'adm_admins', 'success'), b('🧩 BOTONES', 'adm_botones', 'success')],
  [b('👥 USUARIOS', 'adm_usuarios', 'primary'), b('📊 ESTADÍSTICAS', 'adm_stats', 'primary')],
  [b('📦 STORAGE TELEGRAM', 'adm_storage')],
  [b('🔄 RECARGAR', 'adm_reload')]
]);

function setPending(userId, action) {
  pending.set(String(userId), action);
}

function clearPending(userId) {
  pending.delete(String(userId));
}

function getPending(userId) {
  return pending.get(String(userId));
}

async function showPanel(ctx, edit = false) {
  const [p, m, media, users, storage] = await Promise.all([
    getPlantillas(), getModelos(), getBotMedia(), getUsers(), getStorage()
  ]);
  const linked = Object.keys(storage.topics || {}).length;
  const text =
    '👑 <b>PANEL DE ADMIN VERIFIEDMODELS</b> 👑\n\n' +
    '👋 Bienvenida: ' + (media.bienvenida ? '✅' : '❌') + '\n' +
    '🖼️ Galería: ' + (media.galeria ? '✅' : '❌') + '\n' +
    '💃 Modelos en Firebase: <b>' + m.length + '</b>\n' +
    '📝 Plantillas: <b>' + Object.keys(p).length + '</b>\n' +
    '👥 Usuarios: <b>' + users.length + '</b>\n' +
    '📦 Temas Storage vinculados: <b>' + linked + '/7</b>\n\n' +
    '☁️ Firebase → datos y configuración\n' +
    '📸 Telegram → fotografías y archivos\n\n' +
    '<i>Selecciona una sección:</i>';

  if (edit) {
    try { return await ctx.editMessageText(text, { parse_mode: 'HTML', ...panelKeyboard() }); }
    catch (_) {}
  }
  return ctx.reply(text, { parse_mode: 'HTML', ...panelKeyboard() });
}

function sectionKeyboard(section) {
  const rows = [];
  if (section === 'bienvenida') {
    rows.push([b('📝 Cambiar texto', 'adm_welcome_text'), b('📸 Cambiar foto', 'adm_welcome_photo')]);
    rows.push([b('🗑️ Eliminar foto', 'adm_welcome_photo_delete')]);
    rows.push([b('💎 Emoji Premium', 'adm_welcome_emoji'), b('👁️ Vista previa', 'adm_welcome_preview')]);
  }
  if (section === 'galeria') {
    rows.push([b('📸 Cambiar foto', 'adm_gallery_photo'), b('📝 Cambiar texto', 'adm_gallery_text')]);
    rows.push([b('🗑️ Eliminar foto', 'adm_gallery_photo_delete')]);
    rows.push([b('💎 Emoji Premium', 'adm_gallery_emoji'), b('🌐 Ver WebApp URL', 'adm_gallery_url')]);
  }
  if (section === 'plantillas') {
    rows.push([b('➕ Crear', 'adm_template_create'), b('📋 Lista', 'adm_template_list')]);
    rows.push([b('🗑️ Eliminar', 'adm_template_delete')]);
  }
  if (section === 'modelos') {
    rows.push([b('📋 Lista', 'adm_model_list'), b('➕ Nueva', 'adm_model_create')]);
    rows.push([b('📸 Foto', 'adm_model_photo'), b('🗑️ Eliminar foto', 'adm_model_photo_delete')]);
    rows.push([b('✏️ Editar', 'adm_model_edit'), b('🗑️ Eliminar', 'adm_model_delete')]);
    rows.push([b('🔄 Reset votos', 'adm_model_reset')]);
  }
  if (section === 'usuarios') {
    rows.push([b('📋 Lista', 'adm_user_list')]);
  }
  if (section === 'admins') {
    rows.push([b('➕ Agregar', 'adm_admin_add'), b('🗑️ Quitar', 'adm_admin_remove')]);
    rows.push([b('📋 Lista', 'adm_admin_list')]);
  }
  if (section === 'botones') {
    rows.push([b('👋 Bienvenida', 'adm_buttons_bienvenida', 'danger')]);
    rows.push([b('🖼️ Galería', 'adm_buttons_galeria', 'primary')]);
    rows.push([b('📝 Plantillas', 'adm_buttons_plantillas', 'danger')]);
    rows.push([b('📋 Ver configuración', 'adm_button_list')]);
  }
  if (section === 'buttons_bienvenida') {
    rows.push([b('🌐 WebApp', 'adm_btnedit:inicio.webapp'), b('👑 Lista de modelos', 'adm_btnedit:inicio.modelos')]);
    rows.push([b('📢 Canal oficial', 'adm_btnedit:inicio.canal_oficial')]);
    rows.push([b('⬅️ Volver', 'adm_botones')]);
  }
  if (section === 'buttons_galeria') {
    rows.push([b('✨ Emoji para listado', 'adm_btnedit:galeria.emoji_listado'), b('🌐 WebApp', 'adm_btnedit:galeria.webapp')]);
    rows.push([b('📢 Canal oficial', 'adm_btnedit:galeria.canal_oficial')]);
    rows.push([b('↩️ Volver', 'adm_btnedit:galeria.volver'), b('🏠 Inicio', 'adm_btnedit:galeria.inicio')]);
    rows.push([b('⬅️ Volver', 'adm_botones')]);
  }
  if (section === 'buttons_plantillas') {
    rows.push([b('🌐 Perfil WebApp', 'adm_btnedit:plantilla.perfil_webapp')]);
    rows.push([b('👍 Votos buenos', 'adm_btnedit:plantilla.votosbueno'), b('👎 Votos malos', 'adm_btnedit:plantilla.votosmalos')]);
    rows.push([b('📢 Canal Free modelo', 'adm_btnedit:plantilla.canal_free'), b('📞 Contactar', 'adm_btnedit:plantilla.contactar')]);
    rows.push([b('↩️ Volver', 'adm_btnedit:plantilla.volver'), b('🏠 Inicio', 'adm_btnedit:plantilla.inicio')]);
    rows.push([b('⬅️ Volver', 'adm_botones')]);
  }
  if (section === 'stats') {
    rows.push([b('📊 Actualizar', 'adm_stats')]);
    rows.push([b('🔄 Reset votos modelo', 'adm_model_reset')]);
  }
  if (section === 'storage') {
    rows.push([b('🔄 Estado', 'adm_storage')]);
    rows.push([b('📖 Cómo vincular', 'adm_storage_help')]);
  }
  rows.push([b('⬅️ Volver al panel', 'adm_home')]);
  return kb(rows);
}

function promptText(ctx, userId, action, message) {
  setPending(userId, action);
  return ctx.reply(message, { parse_mode: 'HTML', ...Markup.forceReply() });
}

function modelRows(models) {
  return models.slice(0, 50).map(m =>
    '• <code>' + escapeHtml(m.id) + '</code> — ' +
    escapeHtml(m.perfil || m.username || m.id) +
    ' | 👍 ' + Number(m.votosBueno || 0) +
    ' 👎 ' + Number(m.votosMalo || 0)
  );
}

module.exports = bot => {
  bot.command('boton', async ctx => {
    if (!await isAdmin(ctx.from.id)) return;

    // Formato: /boton clave #r|#p|#g texto
    // Ejemplo: /boton canal_free #r 💎 CANAL OFICIAL
    const raw = String(ctx.message.text || '').replace(/^\/boton\s*/i, '').trim();
    const match = raw.match(/^(\S+)\s+(#r|#p|#g)\s+([\s\S]+)$/i);

    if (!match) {
      return ctx.reply(
        '🔘 <b>Configurar botón</b>\\n\\n' +
        '<code>/boton canal_free #r 💎 CANAL OFICIAL</code>\\n\\n' +
        '🔴 #r = rojo\\n🔵 #p = primario\\n🟢 #g = verde\\n\\n' +
        '💎 Usa un emoji premium real en el mensaje; Telegram enviará su custom_emoji_id automáticamente.',
        { parse_mode: 'HTML' }
      );
    }

    const key = match[1];
    const style = { '#r': 'danger', '#p': 'primary', '#g': 'success' }[match[2].toLowerCase()];
    const label = match[3].trim();

    // El emoji premium NO se puede obtener del carácter visible 💎.
    // Telegram lo entrega como entidad custom_emoji con custom_emoji_id.
    const entity = (ctx.message.entities || []).find(e => e.type === 'custom_emoji');
    const data = { text: label, style };
    // Se acepta "seccion.clave" para guardar el diseño por sección.
    // Ejemplo: galeria.canal_oficial #r 💎 CANAL OFICIAL
    if (entity?.custom_emoji_id) data.icon_custom_emoji_id = String(entity.custom_emoji_id);

    await saveButtonConfig(key, data);

    return ctx.reply(
      '✅ Botón <b>' + escapeHtml(key) + '</b> actualizado.\\n' +
      '🎨 Color: <b>' + style + '</b>\\n' +
      '💎 Emoji premium: ' + (data.icon_custom_emoji_id ? '✅ detectado automáticamente' : '❌ no detectado'),
      { parse_mode: 'HTML' }
    );
  });

  bot.command('admin', async ctx => {
    if (!await isAdmin(ctx.from.id)) return;
    clearPending(ctx.from.id);
    return showPanel(ctx);
  });

  bot.command('cancel', async ctx => {
    if (!await isAdmin(ctx.from.id)) return;
    const hadPending = !!getPending(ctx.from.id);
    clearPending(ctx.from.id);
    return ctx.reply(hadPending ? '❌ Operación cancelada. No se guardó ningún cambio pendiente.' : 'ℹ️ No hay ninguna operación pendiente para cancelar.');
  });

  bot.action(/^adm_(?!reload$).+/, async ctx => {
    if (!await isAdmin(ctx.from.id)) return ctx.answerCbQuery('Sin permiso');
    const a = ctx.callbackQuery.data;
    await ctx.answerCbQuery();

    if (a === 'adm_home') return showPanel(ctx, true);

    if (a === 'adm_bienvenida') {
      return ctx.editMessageText(
        '👋 <b>BIENVENIDA</b>\n\n' +
        'Aquí administras el texto y la fotografía que recibe el usuario al usar /start.\n\n' +
        'Variables: <code>{mencion}</code> <code>{nombre}</code> <code>{usuario}</code> <code>{username}</code> <code>{nombre_completo}</code>',
        { parse_mode: 'HTML', ...sectionKeyboard('bienvenida') }
      );
    }

    if (a === 'adm_welcome_text') {
      return promptText(ctx, ctx.from.id, 'welcome_text',
        '📝 <b>Nuevo texto de bienvenida</b>\n\nPuedes usar {mencion}, {nombre}, {usuario}, {username}, {nombre_completo}.\n\n✨ Se detectará automáticamente: formato nativo de Telegram, HTML o Markdown.\n💎 Los emojis Premium reales se detectan automáticamente.');
    }

    if (a === 'adm_welcome_emoji') {
      return promptText(ctx, ctx.from.id, 'welcome_emoji',
        '💎 <b>Emoji Premium de bienvenida</b>\n\nManda ahora el emoji Premium real. Telegram enviará automáticamente su <code>custom_emoji_id</code>.');
    }

    if (a === 'adm_welcome_photo') {
      setPending(ctx.from.id, 'welcome_photo');
      return ctx.reply('📸 Envía ahora la foto con caption <code>/bienvenida</code>. Se publicará en el tema 👋 BIENVENIDA del Storage.', { parse_mode: 'HTML' });
    }

    if (a === 'adm_welcome_photo_delete') {
      await deleteBotMedia('bienvenida');
      return ctx.reply('🗑️ Foto de bienvenida eliminada. El bot volverá a mostrar solo el texto.');
    }

    if (a === 'adm_welcome_preview') {
      const [c, media] = await Promise.all([getConfig(), getBotMedia()]);
      const text = c.bienvenida_texto || '👋 ¡Hola {mencion}! 💎';
      return ctx.reply('👁️ <b>Vista previa</b>\n\n' + text.replace(/\{mencion\}/g, '@Usuario'), { parse_mode: 'HTML' });
    }

    if (a === 'adm_galeria') {
      return ctx.editMessageText(
        '🖼️ <b>GALERÍA</b>\n\nLa fotografía se guarda en el tema 🖼️ GALERÍA de Telegram Storage.\nLa URL de la Mini App se conserva en WEBAPP_URL.',
        { parse_mode: 'HTML', ...sectionKeyboard('galeria') }
      );
    }

    if (a === 'adm_gallery_photo_delete') {
      await deleteBotMedia('galeria');
      return ctx.reply('🗑️ Foto de galería eliminada. La lista volverá a mostrarse solo con texto y botones.');
    }

    if (a === 'adm_gallery_photo') {
      setPending(ctx.from.id, 'gallery_photo');
      return ctx.reply('📸 Envía ahora la foto con caption <code>/galeria</code>. Se publicará en el tema 🖼️ GALERÍA.', { parse_mode: 'HTML' });
    }

    if (a === 'adm_gallery_text') {
      return promptText(ctx, ctx.from.id, 'gallery_text',
        '📝 <b>Nuevo texto de galería</b>\n\nPuedes usar {mencion}, {perfil}, {edad}, {nacionalidad}, {servicios_lista}, {votos}, {votosBueno}, {votosMalo}, {porcentajeBueno}, {porcentajeMalo}, {canalFree}, {contacto}.\n\n✨ Se detectará automáticamente: formato nativo de Telegram, HTML o Markdown.');
    }

    if (a === 'adm_gallery_emoji') {
      return promptText(ctx, ctx.from.id, 'gallery_emoji',
        '💎 <b>Emoji Premium de galería</b>\n\nManda ahora el emoji Premium real. Se guardará automáticamente.');
    }

    if (a === 'adm_gallery_url') {
      return ctx.reply('🌐 <b>WEBAPP_URL</b>\n\n<code>' + escapeHtml(process.env.WEBAPP_URL || 'No configurada') + '</code>', { parse_mode: 'HTML' });
    }

    if (a === 'adm_plantillas') {
      return ctx.editMessageText('📝 <b>PLANTILLAS</b>\n\nCrea plantillas con variables y guarda sus fotografías en 📝 PLANTILLAS.', { parse_mode: 'HTML', ...sectionKeyboard('plantillas') });
    }

    if (a === 'adm_template_create') {
      return promptText(ctx, ctx.from.id, 'template_create',
        '➕ <b>Nueva plantilla</b>\n\nEscribe: <code>Nombre | Texto con {perfil} {edad} {nacionalidad} {servicios} {votosBueno} {votosMalo} {total_votos}</code>');
    }

    if (a === 'adm_template_list') {
      const p = await getPlantillas();
      const rows = Object.keys(p).map(id =>
        '• <code>' + escapeHtml(id) + '</code> — ' + escapeHtml(p[id].nombre || id) +
        (p[id].media_file_id ? ' 📸' : '')
      );
      return ctx.reply('📋 <b>PLANTILLAS</b>\n\n' + (rows.join('\n') || 'Sin plantillas'), { parse_mode: 'HTML', ...sectionKeyboard('plantillas') });
    }

    if (a === 'adm_template_delete') {
      return promptText(ctx, ctx.from.id, 'template_delete', '🗑️ Escribe el <code>ID</code> de la plantilla que deseas eliminar.');
    }

    if (a === 'adm_modelos') {
      return ctx.editMessageText('💃 <b>MODELOS</b>\n\nLos datos viven en Firebase. Las fotos del bot se publican en el tema 💃 MODELOS y se guardan como file_id.', { parse_mode: 'HTML', ...sectionKeyboard('modelos') });
    }

    if (a === 'adm_model_list') {
      const m = await getModelos();
      return ctx.reply('📋 <b>MODELOS</b>\n\n' + (modelRows(m).join('\n') || 'Sin modelos'), { parse_mode: 'HTML', ...sectionKeyboard('modelos') });
    }

    if (a === 'adm_model_create') {
      return promptText(ctx, ctx.from.id, 'model_create',
        '➕ <b>Nueva modelo</b>\n\nEscribe una línea JSON con los campos que quieras guardar. Ejemplo:\n<code>{"id":"modelo_01","perfil":"Nombre","edad":25,"nacionalidad":"MX","servicios":"Chat hot","descripcion":"Descripción","canal_free":"https://t.me/ejemplo"}</code>\n\nLa foto se puede enviar después con /foto_modelo ID.');
    }

    if (a === 'adm_model_photo') {
      return promptText(ctx, ctx.from.id, 'model_photo', '📸 Escribe el <code>ID</code> de la modelo. Después envía la foto con <code>/foto_modelo ID</code>.');
    }

    if (a === 'adm_model_photo_delete') {
      return promptText(ctx, ctx.from.id, 'model_photo_delete', '🗑️ Escribe el <code>ID</code> de la modelo cuya foto deseas eliminar del bot.');
    }

    if (a === 'adm_model_edit') {
      return promptText(ctx, ctx.from.id, 'model_edit',
        '✏️ Escribe: <code>ID | campo | valor</code>\nEjemplo: <code>modelo_01 | edad | 26</code>');
    }

    if (a === 'adm_model_delete') {
      return promptText(ctx, ctx.from.id, 'model_delete', '🗑️ Escribe el <code>ID</code> de la modelo que deseas eliminar.');
    }

    if (a === 'adm_model_reset') {
      return promptText(ctx, ctx.from.id, 'model_reset', '🔄 Escribe el <code>ID</code> de la modelo a la que deseas poner sus votos en 0.');
    }

    if (a === 'adm_usuarios') {
      return ctx.editMessageText('👥 <b>USUARIOS</b>\n\nUsuarios registrados por /start. Desde aquí puedes consultar el registro.', { parse_mode: 'HTML', ...sectionKeyboard('usuarios') });
    }

    if (a === 'adm_user_list') {
      const u = await getUsers();
      const rows = u.slice(0, 100).map(x =>
        '• <code>' + escapeHtml(x.id) + '</code> — ' +
        escapeHtml(x.username ? '@' + x.username : (x.first_name || 'Sin nombre')) +
        (x.baneado ? ' 🔴' : ' 🟢')
      );
      return ctx.reply('📋 <b>USUARIOS</b>\n\n' + (rows.join('\n') || 'Sin usuarios'), { parse_mode: 'HTML', ...sectionKeyboard('usuarios') });
    }

    if (a === 'adm_admins') {
      return ctx.editMessageText('👑 <b>ADMINISTRADORES</b>\n\nPuedes agregar o quitar IDs de Telegram almacenados en Firebase. ADMIN_IDS/ADMIN_ID del entorno siempre tienen prioridad.', { parse_mode: 'HTML', ...sectionKeyboard('admins') });
    }

    if (a === 'adm_admin_list') {
      const c = await getConfig();
      const env = String(process.env.ADMIN_IDS || process.env.ADMIN_ID || '').split(',').map(x => x.trim()).filter(Boolean);
      const admins = [...new Set([...env, ...(Array.isArray(c.admins) ? c.admins.map(String) : [])])];
      return ctx.reply('📋 <b>ADMINS</b>\n\n' + (admins.map(id => '• <code>' + escapeHtml(id) + '</code>').join('\n') || 'Ninguno'), { parse_mode: 'HTML', ...sectionKeyboard('admins') });
    }

    if (a === 'adm_admin_add') return promptText(ctx, ctx.from.id, 'admin_add', '➕ Escribe el <code>ID numérico de Telegram</code> que deseas agregar como administrador.');
    if (a === 'adm_admin_remove') return promptText(ctx, ctx.from.id, 'admin_remove', '🗑️ Escribe el <code>ID</code> que deseas quitar de Firebase. No se puede quitar ADMIN_IDS desde el panel.');

    if (a === 'adm_botones') {
      return ctx.editMessageText('🔘 <b>BOTONES</b>\n\nConfigura texto, color y emoji premium. Los estilos disponibles son <b>primary</b>, <b>success</b> y <b>danger</b>.', { parse_mode: 'HTML', ...sectionKeyboard('botones') });
    }

    if (a === 'adm_button_list') {
      const bc = await getButtonConfig();
      const keys = Object.keys(bc);
      return ctx.reply('📋 <b>BOTONES CONFIGURADOS</b>\n\n' +
        (keys.length ? keys.map(k =>
          '• <code>' + escapeHtml(k) + '</code> → ' + escapeHtml(bc[k].text || '') +
          ' [' + escapeHtml(bc[k].style || 'primary') + ']' +
          (bc[k].icon_custom_emoji_id ? ' 💎' : '')
        ).join('\n') : 'Sin personalizaciones.'), { parse_mode: 'HTML', ...sectionKeyboard('botones') });
    }

    if (a === 'adm_button_edit') {
      return promptText(ctx, ctx.from.id, 'button_edit', '✏️ <b>Diseño de botones</b>\n\nFormato: <code>seccion.clave #r 💎 TEXTO</code>\n\n🔴 #r = rojo · 🔵 #p = azul · 🟢 #g = verde\n💎 Usa un emoji premium real; Telegram entrega su ID automáticamente.');
    }

    if (a.startsWith('adm_btnedit:')) {
      const forcedKey = a.slice('adm_btnedit:'.length).trim();
      if (!forcedKey) return ctx.reply('❌ Botón no válido.');
      return promptText(ctx, ctx.from.id, 'button_edit:' + forcedKey,
        '✏️ <b>Editar botón</b>\n\nBotón: <code>' + escapeHtml(forcedKey) + '</code>\n\nEscribe: <code>#r TEXTO</code> o <code>#p TEXTO</code> o <code>#g TEXTO</code>\n💎 Si incluyes un emoji Premium real, se guardará automáticamente.');
    }

    if (a === 'adm_stats') {
      const m = await getModelos();
      const u = await getUsers();
      const bueno = m.reduce((n, x) => n + Number(x.votosBueno || 0), 0);
      const malo = m.reduce((n, x) => n + Number(x.votosMalo || 0), 0);
      return ctx.reply('📊 <b>ESTADÍSTICAS</b>\n\n👥 Usuarios: ' + u.length + '\n💃 Modelos: ' + m.length + '\n👍 Buenos: ' + bueno + '\n👎 Malos: ' + malo + '\n🗳️ Total: ' + (bueno + malo), { parse_mode: 'HTML', ...sectionKeyboard('stats') });
    }

    if (a === 'adm_storage') {
      const s = await getStorage();
      const keys = ['bienvenida', 'plantillas', 'galeria', 'botones', 'admins', 'usuarios', 'modelos'];
      return ctx.editMessageText(
        '📦 <b>STORAGE TELEGRAM</b>\n\n' +
        'Grupo: <code>' + escapeHtml(String(s.group_id || 'no vinculado')) + '</code>\n\n' +
        keys.map(k => '• ' + k + ': ' + (s.topics?.[k]?.message_thread_id ? '✅ Topic ' + s.topics[k].message_thread_id : '❌')).join('\n') +
        '\n\nLas fotos se publican en los temas ya vinculados y Firebase solo conserva sus referencias.',
        { parse_mode: 'HTML', ...sectionKeyboard('storage') }
      );
    }

    if (a === 'adm_storage_help') {
      return ctx.reply(
        '📖 <b>VINCULAR TEMAS</b>\n\n' +
        'Dentro de cada tema del grupo de Storage ejecuta:\n\n' +
        '<code>/vincular bienvenida</code>\n' +
        '<code>/vincular galeria</code>\n' +
        '<code>/vincular modelos</code>\n' +
        '<code>/vincular plantillas</code>\n' +
        '<code>/vincular botones</code>\n' +
        '<code>/vincular admins</code>\n' +
        '<code>/vincular usuarios</code>\n' +
        '<code>/vincular modelos</code>\n' +
        '<code>/vincular otros</code>',
        { parse_mode: 'HTML', ...sectionKeyboard('storage') }
      );
    }

    return showPanel(ctx);
  });

  bot.action('adm_reload', async ctx => {
    if (!await isAdmin(ctx.from.id)) return ctx.answerCbQuery('Sin permiso');
    clearPending(ctx.from.id);
    await ctx.answerCbQuery('Recargado');
    return showPanel(ctx, true);
  });


  bot.on(['photo', 'document'], async (ctx, next) => {
    if (!await isAdmin(ctx.from.id)) return;

    const action = getPending(ctx.from.id);
    const caption = String(ctx.message.caption || '').trim();

    // Aceptamos los estados actuales y los nombres usados por la versión
    // anterior para no romper configuraciones o flujos ya existentes.
    const welcomeActions = new Set(['welcome_photo', 'foto_bienvenida']);
    const galleryActions = new Set(['gallery_photo', 'foto_galeria']);

    const key = welcomeActions.has(action) || /^\/bienvenida(?:\s|$)/i.test(caption)
      ? 'bienvenida'
      : galleryActions.has(action) || /^\/galeria(?:\s|$)/i.test(caption)
        ? 'galeria'
        : null;

    if (!key) return next();

    const fileId = ctx.message.photo?.at(-1)?.file_id || ctx.message.document?.file_id;
    if (!fileId) return ctx.reply('❌ No pude obtener el file_id de la fotografía o documento.');

    try {
      await saveBotMedia(key, fileId);

      let storageOk = false;
      try {
        await publishPhotoToStorage(
          ctx.telegram,
          key,
          fileId,
          caption.replace(/^\/(?:bienvenida|galeria)\s*/i, '').trim()
        );
        storageOk = true;
      } catch (storageError) {
        console.error('MEDIA: Storage no disponible para ' + key + ':', storageError.message || storageError);
      }

      clearPending(ctx.from.id);
      return ctx.reply(
        '✅ Foto de <b>' + (key === 'bienvenida' ? 'BIENVENIDA' : 'GALERÍA') + '</b> guardada.\n' +
        '🆔 Telegram file_id: <code>' + escapeHtml(fileId) + '</code>\n' +
        '📦 Storage Telegram: ' + (storageOk ? '✅ publicada' : '⚠️ guardada; revisa la vinculación del tema'),
        { parse_mode: 'HTML' }
      );
    } catch (e) {
      console.error('MEDIA: error guardando ' + key + ':', e);
      return ctx.reply('❌ No pude guardar la fotografía: ' + escapeHtml(e.message || 'error'), { parse_mode: 'HTML' });
    }
  });

  bot.on('text', async (ctx, next) => {
    if (!await isAdmin(ctx.from.id)) return next();
    const action = getPending(ctx.from.id);
    if (!action) return next();

    const text = String(ctx.message.text || '').trim();
    if (!text || text.startsWith('/')) return next();

    try {
      if (action === 'welcome_emoji' || action === 'emoji_bienvenida') {
        const entity = (ctx.message.entities || []).find(e => e.type === 'custom_emoji' && e.custom_emoji_id);
        if (!entity?.custom_emoji_id) return ctx.reply('❌ Manda un emoji Premium real de Telegram.');
        await saveConfig({ bienvenida_emoji_premium: String(entity.custom_emoji_id) });
        clearPending(ctx.from.id);
        return ctx.reply('✅ Emoji Premium de bienvenida guardado automáticamente.');
      }

      if (action === 'gallery_emoji' || action === 'emoji_galeria') {
        const entity = (ctx.message.entities || []).find(e => e.type === 'custom_emoji' && e.custom_emoji_id);
        if (!entity?.custom_emoji_id) return ctx.reply('❌ Manda un emoji Premium real de Telegram.');
        await saveConfig({ galeria_emoji_premium: String(entity.custom_emoji_id) });
        clearPending(ctx.from.id);
        return ctx.reply('✅ Emoji Premium de galería guardado automáticamente.');
      }

      if (action === 'welcome_text' || action === 'texto_bienvenida') {
        const entities = ctx.message.entities || [];
        const premiumIds = entities
          .filter(e => e.type === 'custom_emoji' && e.custom_emoji_id)
          .map(e => String(e.custom_emoji_id));

        const { textoConPremiumToHtml } = require('../utils');
        const converted = textoConPremiumToHtml(text, entities);

        await saveConfig({
          bienvenida_texto: converted.html,
          bienvenida_entities: entities,
          bienvenida_parse_mode: prepararTextoTelegram(converted.html, entities).parse_mode || null,
          ...(premiumIds.length ? { bienvenida_emoji_premium: premiumIds[0] } : {})
        });
        try {
          await publishTextToStorage(ctx.telegram, 'bienvenida', converted.html, { parse_mode: 'HTML' });
        } catch (storageError) {
          console.error('BIENVENIDA: Storage:', storageError.message || storageError);
        }
        clearPending(ctx.from.id);

        return ctx.reply(
          '✅ Texto de bienvenida actualizado.' +
          (premiumIds.length ? '\n💎 Emoji premium detectado automáticamente.' : '') +
          '\n\nUsa /admin para volver al panel.'
        );
      }

      if (action === 'gallery_text' || action === 'texto_galeria') {
        const entities = ctx.message.entities || [];
        const premium = entities.find(e => e.type === 'custom_emoji' && e.custom_emoji_id);
        const { textoConPremiumToHtml } = require('../utils');
        const converted = textoConPremiumToHtml(text, entities);
        await saveConfig({
          galeria_texto: converted.html,
          galeria_entities: entities,
          galeria_parse_mode: prepararTextoTelegram(converted.html, entities).parse_mode || null,
          ...(premium?.custom_emoji_id ? { galeria_emoji_premium: String(premium.custom_emoji_id) } : {})
        });
        try {
          await publishTextToStorage(ctx.telegram, 'galeria', converted.html, { parse_mode: 'HTML' });
        } catch (storageError) {
          console.error('GALERIA: Storage:', storageError.message || storageError);
        }
        clearPending(ctx.from.id);
        return ctx.reply('✅ Texto de galería actualizado.' + (premium ? '\n💎 Emoji Premium detectado automáticamente.' : ''));
      }

      if (action === 'model_photo') {
        const model = await require('../config/db').getModelo(text);
        if (!model) return ctx.reply('❌ Modelo no encontrada.');
        clearPending(ctx.from.id);
        return ctx.reply('📸 Ahora envía la foto con caption <code>/foto_modelo ' + escapeHtml(text) + '</code>.', { parse_mode: 'HTML' });
      }

      if (action === 'model_photo_delete') {
        const model = await require('../config/db').getModelo(text);
        if (!model) return ctx.reply('❌ Modelo no encontrada.');
        await deleteModelBotMedia(text);
        clearPending(ctx.from.id);
        return ctx.reply('🗑️ Foto de <b>' + escapeHtml(model.perfil || text) + '</b> eliminada del bot.', { parse_mode: 'HTML' });
      }

      if (action === 'template_create') {
        const parts = text.split('|');
        if (parts.length < 2) return ctx.reply('❌ Formato: Nombre | Texto');
        const { slugify } = require('../utils');
        const nombre = parts.shift().trim();
        const id = slugify(nombre);
        const plantillaText = parts.join('|').trim();
        const entities = ctx.message.entities || [];
        const { textoConPremiumToHtml } = require('../utils');
        const converted = textoConPremiumToHtml(plantillaText, entities);
        await require('../config/db').savePlantilla(id, {
          nombre,
          texto: converted.html,
          entities,
          parse_mode: prepararTextoTelegram(converted.html, entities).parse_mode || null
        });
        let storageOk = false;
        let storageError = '';
        try {
          await publishTextToStorage(ctx.telegram, 'plantillas',
            '📝 PLANTILLA\nID: ' + id + '\nNombre: ' + nombre + '\n\n' + converted.html,
            { parse_mode: 'HTML' });
          storageOk = true;
        } catch (storageErrorObject) {
          storageError = String(storageErrorObject.message || storageErrorObject);
          console.error('PLANTILLA: Storage:', storageError);
        }
        clearPending(ctx.from.id);
        return ctx.reply(
          '✅ Plantilla <b>' + escapeHtml(nombre) + '</b> creada en Firebase. ID: <code>' + id + '</code>\n' +
          '📦 Storage Telegram: ' + (storageOk ? '✅ publicada en 📝 PLANTILLAS' : '⚠️ no publicada: ' + escapeHtml(storageError || 'tema no vinculado')) +
          '\n\nSi aparece ⚠️, entra al tema 📝 PLANTILLAS y ejecuta <code>/vincular plantillas</code>.',
          { parse_mode: 'HTML' }
        );
      }

      if (action === 'template_delete') {
        await deletePlantilla(text);
        clearPending(ctx.from.id);
        return ctx.reply('🗑️ Plantilla <code>' + escapeHtml(text) + '</code> eliminada.', { parse_mode: 'HTML' });
      }

      if (action === 'model_create') {
        const data = JSON.parse(text);
        if (!data.id) throw new Error('Falta id');
        const { savePlantilla } = require('../config/db');
        const { db } = require('../config/db');
        const id = String(data.id);
        delete data.id;
        data.votosBueno = Number(data.votosBueno || 0);
        data.votosMalo = Number(data.votosMalo || 0);
        await db.collection('modelos').doc(id).set(data, { merge: true });
        clearPending(ctx.from.id);
        return ctx.reply('✅ Modelo <b>' + escapeHtml(data.perfil || id) + '</b> creada con ID <code>' + escapeHtml(id) + '</code>.', { parse_mode: 'HTML' });
      }

      if (action === 'model_edit') {
        const parts = text.split('|');
        if (parts.length < 3) return ctx.reply('❌ Formato: ID | campo | valor');
        const [id, field, ...rest] = parts.map(x => x.trim());
        const { db } = require('../config/db');
        const ref = db.collection('modelos').doc(id);
        const snap = await ref.get();
        if (!snap.exists) return ctx.reply('❌ Modelo no encontrada.');
        const numeric = ['edad', 'votosBueno', 'votosMalo'];
        await ref.set({ [field]: numeric.includes(field) ? Number(rest.join('|')) : rest.join('|') }, { merge: true });
        clearPending(ctx.from.id);
        return ctx.reply('✅ Campo <code>' + escapeHtml(field) + '</code> actualizado.', { parse_mode: 'HTML' });
      }

      if (action === 'model_delete') {
        const model = await require('../config/db').getModelo(text);
        if (!model) return ctx.reply('❌ Modelo no encontrada.');
        await deleteModelo(text);
        clearPending(ctx.from.id);
        return ctx.reply('🗑️ Modelo eliminada: <b>' + escapeHtml(model.perfil || text) + '</b>.', { parse_mode: 'HTML' });
      }

      if (action === 'model_reset') {
        const model = await require('../config/db').getModelo(text);
        if (!model) return ctx.reply('❌ Modelo no encontrada.');
        await resetModeloVotes(text);
        clearPending(ctx.from.id);
        return ctx.reply('🔄 Votos de <b>' + escapeHtml(model.perfil || text) + '</b> reiniciados.', { parse_mode: 'HTML' });
      }

      if (action === 'admin_add' || action === 'admin_remove') {
        if (!/^\d+$/.test(text)) return ctx.reply('❌ Debe ser un ID numérico de Telegram.');
        const c = await getConfig();
        const admins = Array.isArray(c.admins) ? c.admins.map(String) : [];
        if (action === 'admin_add') {
          if (!admins.includes(text)) admins.push(text);
          await saveConfig({ admins });
          try {
            await publishTextToStorage(ctx.telegram, 'admins', '👑 ADMIN ASCENDIDO\n🆔 ID: ' + text + '\n👤 Por: ' + String(ctx.from.id), {});
          } catch (storageError) {
            console.error('ADMINS: Storage:', storageError.message || storageError);
          }
          clearPending(ctx.from.id);
          return ctx.reply('✅ ID <code>' + text + '</code> agregado como administrador.', { parse_mode: 'HTML' });
        }
        const nextAdmins = admins.filter(id => id !== text);
        await saveConfig({ admins: nextAdmins });
        clearPending(ctx.from.id);
        return ctx.reply('🗑️ ID <code>' + text + '</code> quitado de los administradores de Firebase.', { parse_mode: 'HTML' });
      }

      if (action === 'button_edit' || action.startsWith('button_edit:')) {
        const forcedKey = action.startsWith('button_edit:') ? action.slice('button_edit:'.length) : '';
        const match = forcedKey
          ? text.match(/^(#r|#p|#g)\s+([\s\S]+)$/i)
          : text.match(/^(\S+)\s+(#r|#p|#g)\s+([\s\S]+)$/i);
        if (!match) return ctx.reply('❌ Formato: <code>' + escapeHtml(forcedKey || 'clave') + (forcedKey ? ' #r TEXTO' : ' #r 💎 TEXTO') + '</code>', { parse_mode: 'HTML' });
        const key = forcedKey || match[1];
        const styleToken = forcedKey ? match[1] : match[2];
        const label = (forcedKey ? match[2] : match[3]).trim();
        const style = { '#r': 'danger', '#p': 'primary', '#g': 'success' }[styleToken.toLowerCase()];
        const data = { text: label, style };
        const entity = (ctx.message.entities || []).find(e => e.type === 'custom_emoji');
        if (entity?.custom_emoji_id) data.icon_custom_emoji_id = String(entity.custom_emoji_id);
        await saveButtonConfig(key, data);
        try {
          await publishTextToStorage(
            ctx.telegram,
            'botones',
            '🧩 BOTÓN ACTUALIZADO\nClave: ' + key + '\nEstilo: ' + style + '\nTexto: ' + label +
              (data.icon_custom_emoji_id ? '\n💎 Emoji Premium: ' + data.icon_custom_emoji_id : ''),
            {}
          );
        } catch (storageError) {
          console.error('BOTONES: Storage:', storageError.message || storageError);
        }
        clearPending(ctx.from.id);
        return ctx.reply('✅ Botón <code>' + escapeHtml(key) + '</code> actualizado.\n🎨 ' + style + '\n💎 ' + (data.icon_custom_emoji_id ? 'emoji premium detectado automáticamente' : 'sin emoji personalizado'), { parse_mode: 'HTML' });
      }

      return next();
    } catch (e) {
      console.error('Admin action error:', e);
      return ctx.reply('❌ No pude completar la operación: ' + escapeHtml(e.message || 'error'), { parse_mode: 'HTML' });
    }
  });
};
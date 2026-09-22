const { sendLista } = require('./modelos');
module.exports = bot => {
  bot.command('galeria', async ctx => {
    try {
      return await sendLista(ctx);
    } catch (e) {
      console.error('GALERIA: error cargando lista de modelos:', e);
      return ctx.reply('❌ No pude cargar la galería de modelos.');
    }
  });

  bot.action('galeria', async ctx => {
    await ctx.answerCbQuery().catch(() => {});
    try { await ctx.deleteMessage().catch(() => {}); } catch (_) {}
    return sendLista(ctx);
  });
};
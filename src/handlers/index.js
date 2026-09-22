const startHandler=require('./start');
const adminHandler=require('./admin');
const plantillasHandler=require('./plantillas');
const modelosHandler=require('./modelos');
const galeriaHandler=require('./galeria');
const textHandler=require('./text');
const {linkStorageTopic}=require('../config/db');

const STORAGE_TOPICS={
  bienvenida:'👋 BIENVENIDA',
  plantillas:'📝 PLANTILLAS',
  galeria:'🖼️ GALERÍA',
  botones:'🧩 BOTONES',
  admins:'👑 ADMINS',
  usuarios:'👥 USUARIOS',
  modelos:'💃 MODELOS'
};

function registerStorageLink(bot){
  bot.command('vincular',async ctx=>{
    try{
      if(!ctx.chat||ctx.chat.type!=='supergroup')return ctx.reply('❌ Este comando solo se puede usar dentro del grupo de almacenamiento.');
      const threadId=ctx.message?.message_thread_id;
      if(!threadId)return ctx.reply('❌ Este comando debe enviarse dentro de uno de los temas.');
      const member=await ctx.telegram.getChatMember(ctx.chat.id,ctx.from.id);
      if(!['creator','administrator'].includes(member.status))return ctx.reply('❌ Solo un administrador puede vincular los temas.');
      const key=(ctx.message.text||'').trim().split(/\s+/)[1]?.toLowerCase();
      if(!STORAGE_TOPICS[key])return ctx.reply('❌ Tema no válido. Usa /vincular bienvenida, plantillas, galeria, botones, admins, usuarios o modelos.');
      await linkStorageTopic(key,{group_id:ctx.chat.id,topic:{name:STORAGE_TOPICS[key],message_thread_id:Number(threadId)}});
      return ctx.reply('✅ '+STORAGE_TOPICS[key]+' vinculado correctamente.\n\n🆔 Topic ID: '+threadId);
    }catch(error){console.error('Error vinculando tema:',error);return ctx.reply('❌ No pude vincular este tema. Revisa que el bot sea administrador del grupo.');}
  });
}
function registerHandlers(bot){
  startHandler(bot);adminHandler(bot);plantillasHandler(bot);modelosHandler(bot);galeriaHandler(bot);registerStorageLink(bot);textHandler(bot);
  console.log('✅ Todos los handlers cargados');
}
module.exports={registerHandlers};

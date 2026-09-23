const PROJECT_ID=process.env.FIREBASE_PROJECT_ID;
const CLIENT_EMAIL=process.env.FIREBASE_CLIENT_EMAIL;
const PRIVATE_KEY=(process.env.FIREBASE_PRIVATE_KEY||'').trim().replace(/^['"]|['"]$/g,'').replace(/\\r/g,'').replace(/\\\\n/g,'\\n');
let tokenCache={token:null,expires:0};
let d1Ready=false;
function getD1(){return globalThis.__verifiedmodelsEnv?.VM_DB||null;}
async function ensureD1(){
  const db=getD1();
  if(!db) throw new Error('Falta binding D1 VM_DB en Cloudflare.');
  if(!d1Ready){
    await db.prepare(`CREATE TABLE IF NOT EXISTS usuarios (
      id TEXT PRIMARY KEY, username TEXT, first_name TEXT, last_name TEXT,
      status TEXT DEFAULT 'activo', actualizado TEXT
    )`).run();
    await db.prepare(`CREATE TABLE IF NOT EXISTS plantillas (
      id TEXT PRIMARY KEY, nombre TEXT NOT NULL, texto TEXT NOT NULL,
      entities TEXT, parse_mode TEXT, media_file_id TEXT, actualizado TEXT
    )`).run();
    d1Ready=true;
  }
  return db;
}

function b64url(input){return btoa(String.fromCharCode(...new Uint8Array(input))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function enc(s){return encodeURIComponent(String(s));}
function firestoreValue(v){
  if(v===null||v===undefined)return {nullValue:null};
  if(typeof v==='boolean')return {booleanValue:v};
  if(typeof v==='number')return Number.isInteger(v)?{integerValue:String(v)}:{doubleValue:v};
  if(v instanceof Date)return {timestampValue:v.toISOString()};
  if(Array.isArray(v))return {arrayValue:{values:v.map(firestoreValue)}};
  if(typeof v==='object')return {mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,firestoreValue(x)]))}};
  return {stringValue:String(v)};
}
function fromValue(v){
  if(!v)return null;
  if('stringValue'in v)return v.stringValue;
  if('integerValue'in v)return Number(v.integerValue);
  if('doubleValue'in v)return v.doubleValue;
  if('booleanValue'in v)return v.booleanValue;
  if('timestampValue'in v)return v.timestampValue;
  if('nullValue'in v)return null;
  if('arrayValue'in v)return (v.arrayValue.values||[]).map(fromValue);
  if('mapValue'in v)return fromFields(v.mapValue.fields||{});
  return null;
}
function fromFields(fields){return Object.fromEntries(Object.entries(fields||{}).map(([k,v])=>[k,fromValue(v)]));}
function toFields(data){return Object.fromEntries(Object.entries(data||{}).filter(([,v])=>v!==undefined).map(([k,v])=>[k,firestoreValue(v)]));}

async function accessToken(){
  if(tokenCache.token && Date.now()<tokenCache.expires-60000)return tokenCache.token;
  const header=b64url(new TextEncoder().encode(JSON.stringify({alg:'RS256',typ:'JWT'})));
  const now=Math.floor(Date.now()/1000);
  const payload=b64url(new TextEncoder().encode(JSON.stringify({iss:CLIENT_EMAIL,scope:'https://www.googleapis.com/auth/datastore',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600})));
  const pem=PRIVATE_KEY.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,'');
  const bytes=Uint8Array.from(atob(pem),c=>c.charCodeAt(0));
  const key=await crypto.subtle.importKey('pkcs8',bytes,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
  const sig=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,new TextEncoder().encode(header+'.'+payload));
  const assertion=header+'.'+payload+'.'+b64url(sig);
  const res=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion='+encodeURIComponent(assertion)});
  if(!res.ok)throw new Error('Firebase OAuth: '+await res.text());
  const data=await res.json(); tokenCache={token:data.access_token,expires:Date.now()+Number(data.expires_in||3600)*1000}; return data.access_token;
}
async function fs(path,init={}){
  if(!PROJECT_ID||!CLIENT_EMAIL||!PRIVATE_KEY)throw new Error('Faltan FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL o FIREBASE_PRIVATE_KEY.');
  const token=await accessToken();
  const url='https://firestore.googleapis.com/v1/projects/'+enc(PROJECT_ID)+'/databases/(default)/documents/'+path;
  const res=await fetch(url,{...init,headers:{'Authorization':'Bearer '+token,'content-type':'application/json',...(init.headers||{})}});
  if(!res.ok)throw new Error('Firestore '+res.status+': '+await res.text());
  if(res.status===204)return null;
  return res.json();
}
function docPath(collection,id){return collection+'/'+enc(id);}
async function getDoc(collection,id){
  try{const d=await fs(docPath(collection,id)); return d.name?{id:String(id),...fromFields(d.fields)}:null;}
  catch(e){if(String(e.message).startsWith('Firestore 404'))return null;throw e;}
}
async function setDoc(collection,id,data,merge=true){
  const path=docPath(collection,id);
  if(merge){const current=await getDoc(collection,id); data=Object.assign({},current||{},data);}
  return fs(path,{method:'PATCH',body:JSON.stringify({fields:toFields(data)})});
}
async function deleteDoc(collection,id){return fs(docPath(collection,id),{method:'DELETE'});}
async function listDocs(collection){
  let url='https://firestore.googleapis.com/v1/projects/'+enc(PROJECT_ID)+'/databases/(default)/documents/'+collection+'?pageSize=1000';
  const token=await accessToken(), out=[];
  while(url){
    const res=await fetch(url,{headers:{Authorization:'Bearer '+token}});
    if(!res.ok)throw new Error('Firestore '+res.status+': '+await res.text());
    const data=await res.json();
    for(const d of data.documents||[]){const id=d.name.split('/').pop();out.push({id,...fromFields(d.fields)});}
    url=data.nextPageToken?url.split('?')[0]+'?pageSize=1000&pageToken='+encodeURIComponent(data.nextPageToken):null;
  }
  return out;
}
async function getConfig(){
  const [a,b,p]=await Promise.all([getDoc('config','bot'),getDoc('config','botones'),getDoc('config','premium')]);
  return Object.assign({},a||{},{botones:b||{}},{premium:p||{activo:true}});
}
async function saveConfig(data){await setDoc('config','bot',data,true);globalThis.__verifiedmodelsConfigVersion=Date.now();}
async function getUser(id){
  const db=await ensureD1();
  const r=await db.prepare('SELECT * FROM usuarios WHERE id=?').bind(String(id)).first();
  return r||null;
}
async function saveUser(id,info){
  const db=await ensureD1(), now=new Date().toISOString();
  const current=await getUser(id);
  const row=Object.assign({},current||{},info,{id:String(id),actualizado:now});
  await db.prepare(`INSERT INTO usuarios (id,username,first_name,last_name,status,actualizado)
    VALUES (?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET username=excluded.username,first_name=excluded.first_name,last_name=excluded.last_name,status=excluded.status,actualizado=excluded.actualizado`)
    .bind(String(id),String(row.username||''),String(row.first_name||''),String(row.last_name||''),String(row.status||'activo'),now).run();
  return row;
}
async function getUsers(){
  const db=await ensureD1();
  const r=await db.prepare('SELECT * FROM usuarios ORDER BY actualizado DESC').all();
  return r.results||[];
}
async function setUserStatus(id,data){
  const db=await ensureD1();
  await db.prepare('UPDATE usuarios SET status=?, actualizado=? WHERE id=?')
    .bind(String(data.status||'activo'),new Date().toISOString(),String(id)).run();
  return getUser(id);
}
async function getPlantillas(){
  const db=await ensureD1();
  const r=await db.prepare('SELECT * FROM plantillas ORDER BY actualizado DESC').all();
  const o={};
  for(const x of (r.results||[])){
    let entities=[];
    try{entities=x.entities?JSON.parse(x.entities):[];}catch(_){}
    o[x.id]={id:x.id,nombre:x.nombre,texto:x.texto,entities,parse_mode:x.parse_mode||undefined,media_file_id:x.media_file_id||undefined,actualizado:x.actualizado};
  }
  return o;
}
async function savePlantilla(id,data){
  const db=await ensureD1(), now=new Date().toISOString();
  const current=(await getPlantillas())[id]||{};
  const row=Object.assign({},current,data,{id:String(id),actualizado:now});
  await db.prepare(`INSERT INTO plantillas (id,nombre,texto,entities,parse_mode,media_file_id,actualizado)
    VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET nombre=excluded.nombre,texto=excluded.texto,entities=excluded.entities,parse_mode=excluded.parse_mode,media_file_id=COALESCE(excluded.media_file_id,plantillas.media_file_id),actualizado=excluded.actualizado`)
    .bind(String(id),String(row.nombre||id),String(row.texto||''),JSON.stringify(row.entities||[]),row.parse_mode?String(row.parse_mode):null,row.media_file_id?String(row.media_file_id):null,now).run();
  return row;
}
async function deletePlantilla(id){const db=await ensureD1();await db.prepare('DELETE FROM plantillas WHERE id=?').bind(String(id)).run();}
async function getModelo(id){return getDoc('modelos',String(id));}
async function getModelos(){try{return await listDocs('modelos');}catch(e){const msg=String(e?.message||e);console.error('FIRESTORE getModelos:',msg);throw new Error('getModelos: '+msg);}}
async function deleteModelo(id){await deleteDoc('modelos',String(id));await deleteDoc('config/storage/modelos',String(id)).catch(()=>{});}
async function resetModeloVotes(id){return setDoc('modelos',String(id),{votosBueno:0,votosMalo:0},true);}
async function voteModelo(id,type){
  const ref='modelos/'+enc(id);
  const field=type==='bueno'?'votosBueno':'votosMalo';
  const token=await accessToken();
  const url='https://firestore.googleapis.com/v1/projects/'+enc(PROJECT_ID)+'/databases/(default)/documents:commit';
  const body={writes:[{transform:{document:'projects/'+PROJECT_ID+'/databases/(default)/documents/'+ref,fieldTransforms:[{fieldPath:field,increment:{integerValue:'1'}}]}}]};
  const res=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(body)});
  if(!res.ok)throw new Error('Firestore voto '+res.status+': '+await res.text());
  const m=await getModelo(id);return Number(m?.[field]||0);
}
async function getBotMedia(){const d=await getDoc('config','bot');if(!d)return{};const m=d.media||{};return {...m,bienvenida:m.bienvenida||d.bienvenida_media||d.bienvenida_media_file_id||d.bienvenida_media_url||'',galeria:m.galeria||d.galeria_media||d.galeria_media_file_id||d.galeria_media_url||''};}
async function getButtonConfig(){return (await getDoc('config','botones'))||{};}
async function saveButtonConfig(key,data){
  const raw=String(key);
  if(raw.includes('.')){const [section,buttonKey]=raw.split('.',2);const cur=await getButtonConfig();const sectionData=cur[section]&&typeof cur[section]==='object'?cur[section]:{};return setDoc('config','botones',{[section]:{...sectionData,[buttonKey]:{...data,actualizado:new Date().toISOString()}}},true);}
  return setDoc('config','botones',{[raw]:{...data,actualizado:new Date().toISOString()}},true);
}
async function deleteBotMedia(key){const c=await getConfig();const media={...(c.media||{})};delete media[String(key)];const data={media};if(key==='bienvenida')Object.assign(data,{bienvenida_media:null,bienvenida_media_file_id:null,bienvenida_media_url:null});if(key==='galeria')Object.assign(data,{galeria_media:null,galeria_media_file_id:null,galeria_media_url:null});return setDoc('config','bot',data,true);}
async function saveBotMedia(key,fileId){const media={};media[String(key)]=String(fileId);const data={media};if(key==='bienvenida')Object.assign(data,{bienvenida_media:String(fileId),bienvenida_media_file_id:String(fileId),bienvenida_media_url:String(fileId)});if(key==='galeria')Object.assign(data,{galeria_media:String(fileId),galeria_media_file_id:String(fileId),galeria_media_url:String(fileId)});return setDoc('config','bot',data,true);}
async function saveTemplateMedia(id,fileId){
  const db=await ensureD1();
  await db.prepare('UPDATE plantillas SET media_file_id=?, actualizado=? WHERE id=?').bind(String(fileId),new Date().toISOString(),String(id)).run();
}
async function getStorage(){return (await getDoc('config','storage'))||{};}
async function saveStorageIndex(key,data){const s=await getStorage();return setDoc('config','storage',{media:{...(s.media||{}),[key]:{...data,actualizado:new Date().toISOString()}}},true);}
async function saveModelBotMedia(id,data){return setDoc('config/storage/modelos',String(id),{...data,actualizado:new Date().toISOString()},true);}
async function getModelBotMedia(id){return getDoc('config/storage/modelos',String(id));}
async function linkStorageTopic(key,data){const s=await getStorage();return setDoc('config','storage',{group_id:String(data.group_id),topics:{...(s.topics||{}),[key]:data.topic}},true);}
module.exports={getConfig,saveConfig,getUser,saveUser,getUsers,setUserStatus,getPlantillas,savePlantilla,deletePlantilla,getModelo,getModelos,deleteModelo,resetModeloVotes,voteModelo,getBotMedia,saveBotMedia,getButtonConfig,saveButtonConfig,saveTemplateMedia,getStorage,saveStorageIndex,saveModelBotMedia,getModelBotMedia,deleteModelBotMedia:async id=>deleteDoc('config/storage/modelos',String(id)),linkStorageTopic};

const { getConfig }=require('./config/db');
let value=null,time=0,version=0;
async function getCachedConfig(){
  const currentVersion = Number(global.__verifiedmodelsConfigVersion || 0);
  if(value && Date.now()-time<60000 && version===currentVersion) return value;
  value=await getConfig();
  time=Date.now();
  version=currentVersion;
  return value;
}
function clearCache(){value=null;time=0;version=0;}
module.exports={getConfig:getCachedConfig,clearCache};

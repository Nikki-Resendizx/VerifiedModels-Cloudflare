const fs=require('fs');
const path=require('path');
const {execFileSync}=require('child_process');
const roots=['worker.js','src'];
const files=[];
function walk(target){
  const full=path.resolve(target);
  if(!fs.existsSync(full))return;
  const stat=fs.statSync(full);
  if(stat.isFile()){if(full.endsWith('.js'))files.push(full);return;}
  for(const name of fs.readdirSync(full))walk(path.join(full,name));
}
roots.forEach(walk);
let failed=0;
for(const file of files){
  try{execFileSync(process.execPath,['--check',file],{stdio:'pipe'});console.log('OK',path.relative(process.cwd(),file));}
  catch(error){failed++;console.error('FAIL',path.relative(process.cwd(),file));console.error(String(error.stderr||error.message));}
}
if(failed){console.error('Syntax check failed:',failed);process.exit(1);}
console.log('Syntax check passed:',files.length,'JavaScript files');

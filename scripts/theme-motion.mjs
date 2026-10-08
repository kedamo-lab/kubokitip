import fs from 'node:fs/promises';
for(const name of ['styles.css','motion.css']){
 const file=new URL('../public/'+name,import.meta.url),source=await fs.readFile(file,'utf8');
 const split=name==='styles.css'?source.indexOf('*{box-sizing'):0;
 const prefix=source.slice(0,split);
 const themed=source.slice(split).replace(/#(e4fd2a|0c4652)([\da-f]{2})?\b/gi,(_,color,alpha)=>{
  const variable=color.toLowerCase()==='e4fd2a'?'--lime':'--teal';
  return alpha?`color-mix(in srgb,var(${variable}) ${(parseInt(alpha,16)/255*100).toFixed(2)}%,transparent)`:`var(${variable})`;
 });
 await fs.writeFile(file,prefix+themed);
}

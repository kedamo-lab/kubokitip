import {fileURLToPath} from 'node:url';

if(process.env.SITE_BUILD_TARGET==='layero'){
  await import('./build-layero.mjs');
}else{
  const runner=new URL('./run-framework.mjs',import.meta.url);
  process.argv=[process.execPath,fileURLToPath(runner),'build',...process.argv.slice(2)];
  await import(runner.href);
}

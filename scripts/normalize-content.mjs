import fs from 'node:fs/promises';
import {validateDocument} from '../lib/cms.mjs';
const file=new URL('../public/data/seasons.json',import.meta.url);
const data=JSON.parse(await fs.readFile(file,'utf8'));
await fs.writeFile(file,JSON.stringify(validateDocument(data),null,2)+'\n');

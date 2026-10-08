import { cp, mkdir, rm, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'vercel-dist');
if (path.relative(root, output) !== 'vercel-dist') throw new Error('Unsafe output directory');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(path.join(root, 'public'), output, {
  recursive: true,
  filter: file => path.basename(file) !== 'admin.html',
});
await build({
  configFile: false,
  root,
  publicDir: false,
  build: {
    outDir: output,
    emptyOutDir: false,
    lib: { entry: path.join(root, 'scripts/vercel-upload-entry.js'), formats: ['es'], fileName: () => 'vercel-upload.js' },
  },
});
await Promise.all(['index.html', 'site.js', 'assets/logo.svg', 'vercel-upload.js'].map(file => access(path.join(output, file))));
console.log('Vercel ready: static landing + authenticated CMS function (no .next output required).');

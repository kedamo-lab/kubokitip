import { upload } from '@vercel/blob/client';

export async function uploadVercel(file, csrf) {
  const ext = file.name.split('.').pop().toLowerCase();
  const pathname = `staging/${crypto.randomUUID()}.${ext}`;
  const types = {png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',avif:'image/avif',gif:'image/gif',svg:'image/svg+xml',pdf:'application/pdf',mp4:'video/mp4',webm:'video/webm',woff:'font/woff',woff2:'font/woff2'};
  if (!types[ext]) throw new Error('Неподдерживаемый формат файла.');
  const response = await upload(pathname, file, {
    access: 'private', handleUploadUrl: '/api/blob-upload',
    contentType: types[ext], clientPayload: JSON.stringify({csrf}),
  });
  const result = await fetch('/api/finalize-upload', {
    method: 'POST', headers: {'Content-Type':'application/json','X-Cup-CSRF':csrf},
    body: JSON.stringify({pathname:response.pathname,name:file.name}),
  });
  const info = await result.json();
  if (!result.ok) throw new Error(info.error || 'Не удалось завершить загрузку.');
  return info;
}

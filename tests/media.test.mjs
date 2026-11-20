import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveVideo,renderVideoPlayer} from '../public/media-player.js';

test('An existing Catbox MP4 imported as a link gets an inline player, without editing saved data',()=>{
 const item={type:'embed',src:'https://files.catbox.moe/hc4m60.MP4',mimeType:'video/mp4',caption:'Видео турнира',poster:''},before=structuredClone(item);
 assert.deepEqual(resolveVideo(item),{kind:'file',src:item.src,type:'video/mp4'});
 const html=renderVideoPlayer(item);assert.match(html,/<video[^>]*controls playsinline preload="metadata"/);assert.match(html,/<source src="https:\/\/files.catbox.moe\/hc4m60.MP4" type="video\/mp4">/);assert.doesNotMatch(html,/<iframe|autoplay|crossorigin=/);assert.deepEqual(item,before);
});

test('File type detection handles query strings, encoded extensions, relative files and stale MIME hints',()=>{
 for(const [src,type] of [['https://cdn.test/clip.WEBM?download=1','video/webm'],['https://cdn.test/clip%2Emp4?token=fixture','video/mp4'],['/uploads/clip.mp4','video/mp4'],['https://cdn.test/clip.ogv','video/ogg']]){
  const result=resolveVideo({type:'embed',src,mimeType:'video/mp4'},'https://cup.test/');assert.equal(result.kind,'file');assert.equal(result.type,type);
 }
 assert.equal(resolveVideo({type:'embed',src:'https://cdn.test/download?id=123',mimeType:'video/webm'}).kind,'file');
 assert.equal(resolveVideo({type:'video',src:'/uploads/without-extension'}).kind,'file');
});

test('Known video-platform links retain embedded players, including when a default MIME hint is present',()=>{
 for(const [src,expected] of [['https://youtu.be/fixture123','https://www.youtube.com/embed/fixture123'],['https://www.youtube.com/watch?v=fixture123','https://www.youtube.com/embed/fixture123'],['https://vkvideo.ru/video-1_2','https://vkvideo.ru/video-1_2'],['https://rutube.ru/play/embed/fixture/','https://rutube.ru/play/embed/fixture/']]){
  assert.deepEqual(resolveVideo({type:'embed',src,mimeType:'video/mp4'}),{kind:'embed',src:expected});assert.match(renderVideoPlayer({type:'embed',src}),/<iframe/);
 }
});

test('Unsafe sources are rejected and captions, poster URLs and MIME attributes cannot inject HTML',()=>{
 for(const src of ['javascript:alert(1)','data:text/html,<script>alert(1)</script>','file:///private.mp4',''])assert.equal(resolveVideo({src,type:'embed'}).kind,'invalid');
 const html=renderVideoPlayer({type:'video',src:'https://cdn.test/movie.mp4',caption:'"><script>alert(1)</script>',poster:'javascript:alert(1)',mimeType:'video/mp4" onerror="alert(1)'});
 assert.doesNotMatch(html,/<script>|poster="javascript:| onerror="/);assert.match(html,/&lt;script&gt;/);
 assert.equal(resolveVideo({type:'embed',src:'https://example.test/watch',mimeType:''}).kind,'link');
});

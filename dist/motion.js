'use strict';
(() => {
  const root = document.documentElement;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const revealSelector = '.section-label,.section-heading,.about-content>*,' +
    '.discipline-strip>div,.team-card,.demo-note,#bracket-panel,.table-wrap,' +
    '.result-card,.media-placeholder,.media-item,.winner-card,.organizer,.closing-inner,.footer';
  const watched = new Set();
  const boundPointers = new WeakSet();
  let revealFrame = 0;
  let scrollFrame = 0;
  let scrollTimer = 0;
  let previousScroll = scrollY;
  let tickerAnimation;

  const revealObserver = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('motion-visible');
      revealObserver.unobserve(entry.target);
      watched.delete(entry.target);
    }
  }, {threshold: .08, rootMargin: '0px 0px -25px 0px'}) : null;

  function pointerMotion(element, type) {
    if (boundPointers.has(element)) return;
    boundPointers.add(element);
    if (type === 'card') element.classList.add('motion-tilt');
    let frame = 0;
    let point;
    const reset = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      for (const name of ['--tilt-x','--tilt-y','--hero-rx','--hero-ry']) element.style.setProperty(name,'0deg');
      for (const name of ['--hero-x','--hero-y','--button-x','--button-y']) element.style.setProperty(name,'0px');
    };
    element.addEventListener('pointermove', (event) => {
      if (reducedMotion.matches || !finePointer.matches || event.pointerType === 'touch') return;
      point = {x:event.clientX,y:event.clientY};
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const rect = element.getBoundingClientRect();
        const x = Math.max(-.5,Math.min(.5,(point.x-rect.left)/rect.width-.5));
        const y = Math.max(-.5,Math.min(.5,(point.y-rect.top)/rect.height-.5));
        element.style.setProperty('--spot-x',`${(x+.5)*100}%`);
        element.style.setProperty('--spot-y',`${(y+.5)*100}%`);
        if (type === 'hero') {
          element.style.setProperty('--hero-rx',`${-y*6}deg`);
          element.style.setProperty('--hero-ry',`${x*6}deg`);
          element.style.setProperty('--hero-x',`${x*14}px`);
          element.style.setProperty('--hero-y',`${y*14}px`);
        } else if (type === 'card') {
          element.style.setProperty('--tilt-x',`${-y*5}deg`);
          element.style.setProperty('--tilt-y',`${x*5}deg`);
        } else {
          element.style.setProperty('--button-x',`${x*12}px`);
          element.style.setProperty('--button-y',`${y*10}px`);
        }
      });
    }, {passive:true});
    element.addEventListener('pointerleave',reset);
    element.addEventListener('blur',reset);
  }

  function scan() {
    revealFrame = 0;
    for (const node of watched) {
      if (!node.isConnected) { revealObserver?.unobserve(node); watched.delete(node); }
    }
    document.querySelectorAll(revealSelector).forEach((node) => {
      if (node.classList.contains('motion-reveal')) return;
      node.classList.add('motion-reveal');
      const index = [...node.parentElement.children].indexOf(node);
      node.style.setProperty('--reveal-delay',`${Math.min(index,3)*70}ms`);
      if (reducedMotion.matches || !revealObserver) node.classList.add('motion-visible');
      else { revealObserver.observe(node); watched.add(node); }
    });
    document.querySelectorAll('.team-card,.media-placeholder,.result-card').forEach((node) => pointerMotion(node,'card'));
    document.querySelectorAll('.button:not(:disabled)').forEach((node) => pointerMotion(node,'button'));
  }
  function scheduleScan() { if (!revealFrame) revealFrame = requestAnimationFrame(scan); }

  const ticker = document.querySelector('.ticker>div');
  if (ticker) {
    const group = '<div class="ticker-group">' + Array.from({length:3},() =>
      '<span class="ticker-word">DOTA 2</span><span class="ticker-star">✦</span>' +
      '<span class="ticker-word">CS2</span><span class="ticker-star">✦</span>' +
      '<span class="ticker-word">КУБОК ИТиП</span><span class="ticker-star">✦</span>').join('') + '</div>';
    ticker.classList.add('ticker-track');
    ticker.innerHTML = group + group;
  }
  const hero = document.querySelector('.hero-art');
  if (hero) {
    const sheen = document.createElement('span');
    sheen.className = 'hero-sheen';
    sheen.setAttribute('aria-hidden','true');
    hero.append(sheen);
    pointerMotion(hero,'hero');
  }

  function updateScroll() {
    scrollFrame = 0;
    const maxScroll = root.scrollHeight - innerHeight;
    root.style.setProperty('--scroll-progress',String(maxScroll > 0 ? Math.min(1,scrollY/maxScroll) : 0));
    const delta = Math.abs(scrollY-previousScroll);
    previousScroll = scrollY;
    if (tickerAnimation && !reducedMotion.matches) {
      tickerAnimation.updatePlaybackRate(1 + Math.min(2,delta/120));
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => tickerAnimation?.updatePlaybackRate(1),160);
    }
  }
  function onScroll() { if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScroll); }
  function syncPreference() {
    root.classList.toggle('motion-active',!reducedMotion.matches);
    tickerAnimation = ticker?.getAnimations().find((animation) => animation.animationName === 'ticker-travel');
    if (reducedMotion.matches) {
      revealObserver?.disconnect();
      for (const node of watched) node.classList.add('motion-visible');
      watched.clear();
      document.querySelectorAll('.hero-art,.motion-tilt,.button').forEach((node) => {
        for (const name of ['--tilt-x','--tilt-y','--hero-rx','--hero-ry']) node.style.setProperty(name,'0deg');
        for (const name of ['--hero-x','--hero-y','--button-x','--button-y']) node.style.setProperty(name,'0px');
      });
    }
    scheduleScan();
  }
  document.addEventListener('cup:content-updated',scheduleScan);
  document.addEventListener('visibilitychange',() => root.classList.toggle('motion-paused',document.hidden));
  reducedMotion.addEventListener('change',syncPreference);
  window.addEventListener('scroll',onScroll,{passive:true});
  window.addEventListener('resize',onScroll,{passive:true});
  window.addEventListener('load',onScroll,{once:true});
  syncPreference();
  updateScroll();
  scan();
})();

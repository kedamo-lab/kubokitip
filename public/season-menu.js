'use strict';
(() => {
  const control = document.querySelector('.season-control');
  const select = document.querySelector('#season-select');
  const trigger = document.querySelector('#season-trigger');
  const popover = document.querySelector('#season-popover');
  const list = document.querySelector('#season-list');
  const inner = control.querySelector('.season-popover-inner');
  let signature = '';
  let expanded = false;

  function measure() {
    control.style.setProperty('--season-menu-height',`${Math.ceil(inner.getBoundingClientRect().height)}px`);
  }

  function syncOptions() {
    const nextSignature = `${select.innerHTML}|${select.value}|${select.dataset.currentSeason}|${JSON.stringify(window.cupSite?.header)}`;
    if (nextSignature === signature) return;
    signature = nextSignature;
    document.querySelector('#season-current').textContent = select.value;
    trigger.setAttribute('aria-label',`Сезон ${select.value}`);
    list.replaceChildren(...[...select.options].map((option) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role','option');
      button.setAttribute('aria-selected',String(option.selected));
      button.tabIndex = expanded && option.selected ? 0 : -1;
      button.className = 'season-option';
      button.dataset.year = option.value;
      button.innerHTML = '<span><strong></strong><small></small></span><span class="season-check" aria-hidden="true">✓</span>';
      button.querySelector('strong').textContent = option.value;
      button.querySelector('small').textContent = option.value === select.dataset.currentSeason ? window.cupSite?.header.currentLabel || 'Текущий сезон' : window.cupSite?.header.archiveLabel || 'Архив сезона';
      return button;
    }));
    control.classList.add('season-enhanced');
    select.hidden = true;
    trigger.hidden = false;
    popover.hidden = false;
    popover.inert = !expanded;
    popover.setAttribute('aria-hidden',String(!expanded));
    measure();
  }

  function close(restoreFocus = false) {
    expanded = false;
    popover.inert = true;
    popover.setAttribute('aria-hidden','true');
    [...list.children].forEach((option) => { option.tabIndex = -1; });
    trigger.setAttribute('aria-expanded','false');
    control.classList.remove('season-open');
    if (restoreFocus) trigger.focus({preventScroll:true});
  }
  function open(last = false) {
    measure();
    expanded = true;
    popover.inert = false;
    popover.setAttribute('aria-hidden','false');
    trigger.setAttribute('aria-expanded','true');
    control.classList.add('season-open');
    const options = [...list.children];
    const target = last ? options.at(-1) : list.querySelector('[aria-selected=true]') || options[0];
    options.forEach((option) => { option.tabIndex = option === target ? 0 : -1; });
    target?.focus({preventScroll:true});
  }

  trigger.addEventListener('click',() => expanded ? close() : open());
  trigger.addEventListener('keydown',(event) => {
    if (!['ArrowDown','ArrowUp'].includes(event.key)) return;
    event.preventDefault();
    open(event.key === 'ArrowUp');
  });
  list.addEventListener('click',(event) => {
    const option = event.target.closest('[data-year]');
    if (!option) return;
    select.value = option.dataset.year;
    select.dispatchEvent(new Event('change',{bubbles:true}));
    close(true);
  });
  list.addEventListener('keydown',(event) => {
    if (!['ArrowDown','ArrowUp','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const options = [...list.children];
    const index = options.indexOf(document.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length-1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
    options.forEach((option,index) => { option.tabIndex = index === next ? 0 : -1; });
    options[next]?.focus({preventScroll:true});
  });
  document.addEventListener('pointerdown',(event) => { if (expanded && !control.contains(event.target)) close(); });
  document.addEventListener('keydown',(event) => {
    if (event.key === 'Escape' && expanded) { event.preventDefault(); close(true); }
  });
  control.addEventListener('focusout',() => queueMicrotask(() => { if (!control.contains(document.activeElement)) close(); }));
  document.addEventListener('cup:content-updated',syncOptions);
  select.addEventListener('change',syncOptions);
  syncOptions();
  if ('ResizeObserver' in window) new ResizeObserver(measure).observe(inner);
  else window.addEventListener('resize',measure,{passive:true});
})();

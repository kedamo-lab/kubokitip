'use strict';
(() => {
  const control = document.querySelector('.season-control');
  const select = document.querySelector('#season-select');
  const trigger = document.querySelector('#season-trigger');
  const popover = document.querySelector('#season-popover');
  const list = document.querySelector('#season-list');
  let signature = '';

  function syncOptions() {
    const nextSignature = `${select.innerHTML}|${select.value}|${select.dataset.currentSeason}`;
    if (nextSignature === signature) return;
    signature = nextSignature;
    document.querySelector('#season-current').textContent = select.value;
    trigger.setAttribute('aria-label',`Сезон ${select.value}`);
    list.replaceChildren(...[...select.options].map((option) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role','option');
      button.setAttribute('aria-selected',String(option.selected));
      button.tabIndex = option.selected ? 0 : -1;
      button.className = 'season-option';
      button.dataset.year = option.value;
      button.innerHTML = '<span><strong></strong><small></small></span><span class="season-check" aria-hidden="true">✓</span>';
      button.querySelector('strong').textContent = option.value;
      button.querySelector('small').textContent = option.value === select.dataset.currentSeason ? 'Текущий сезон' : 'Архив турнира';
      return button;
    }));
    control.classList.add('season-enhanced');
    select.hidden = true;
    trigger.hidden = false;
  }

  function close(restoreFocus = false) {
    popover.hidden = true;
    trigger.setAttribute('aria-expanded','false');
    control.classList.remove('season-open');
    if (restoreFocus) trigger.focus({preventScroll:true});
  }
  function open(last = false) {
    popover.hidden = false;
    trigger.setAttribute('aria-expanded','true');
    control.classList.add('season-open');
    const options = [...list.children];
    (last ? options.at(-1) : list.querySelector('[aria-selected=true]') || options[0])?.focus({preventScroll:true});
  }

  trigger.addEventListener('click',() => popover.hidden ? open() : close());
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
    options[next]?.focus({preventScroll:true});
  });
  document.addEventListener('pointerdown',(event) => { if (!control.contains(event.target)) close(); });
  document.addEventListener('keydown',(event) => {
    if (event.key === 'Escape' && !popover.hidden) { event.preventDefault(); close(true); }
  });
  control.addEventListener('focusout',() => queueMicrotask(() => { if (!control.contains(document.activeElement)) close(); }));
  document.addEventListener('cup:content-updated',syncOptions);
  select.addEventListener('change',syncOptions);
  syncOptions();
})();

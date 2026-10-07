'use strict';
const $ = (selector) => document.querySelector(selector);
const html = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl = (value) => { if (!value) return ''; try { const url = new URL(value, location.href); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } };
let database, season;
const selected = { teams: 'dota2', bracket: 'dota2', schedule: 'all' };
const gameById = (id) => season.disciplines.find((game) => game.id === id);
const teamName = (game, id) => game.teams.find((team) => team.id === id)?.name || 'Участник определится';
const shortDate = (date) => date ? new Intl.DateTimeFormat('ru-RU', {day:'2-digit',month:'2-digit',timeZone:'UTC'}).format(new Date(date + 'T12:00:00Z')) : 'Уточняется';
const scoreText = (score) => score === null || score === undefined ? '—' : html(score);

function renderTeams() {
  const game = gameById(selected.teams);
  $('#teams-panel').setAttribute('aria-labelledby', `teams-tab-${game.id}`);
  $('#teams-panel').innerHTML = game.teams.map((team) => `<article class="team-card"><div class="team-art"><img src="${html(safeUrl(team.image))}" alt="${team.demo ? 'Тестовый ростер из брендбука Кубка ИТиП' : `Групповое фото команды ${html(team.name)}`}" loading="lazy" width="404" height="397"></div><div class="team-info"><div class="team-title"><h3>${html(team.name)}</h3>${team.demo ? '<span class="demo-badge">МАКЕТ</span>' : `<span class="demo-badge">${html(game.name)}</span>`}</div><p class="roster-label">СОСТАВ КОМАНДЫ / ${html(game.name.toUpperCase())}</p><ul class="roster">${team.players.map((player, index) => `<li data-number="0${index + 1}">${html(player)}</li>`).join('')}</ul></div></article>`).join('') || '<p class="muted">Участники появятся после подтверждения составов.</p>';
  $('.demo-note').hidden = !game.teams.some((team) => team.demo);
}

function renderBracket() {
  const game = gameById(selected.bracket);
  $('#bracket-panel').setAttribute('aria-labelledby', `bracket-tab-${game.id}`);
  if (!game.bracket.length) {
    $('#bracket-panel').innerHTML = `<div class="empty-bracket"><div class="empty-bracket-content"><div class="bracket-symbol" aria-hidden="true">⌘</div><span class="status-tag">${html(game.name.toUpperCase())} / СКОРО</span><h3>${html(season.bracketAnnouncement)}</h3><p>Здесь будут пары команд и результаты матчей.</p></div></div>`;
    return;
  }
  $('#bracket-panel').innerHTML = `<div class="bracket-rounds">${game.bracket.map((round) => `<section class="bracket-round"><h3>${html(round.name)}</h3>${round.matches.map((match) => `<div class="bracket-match"><div class="${match.winnerId && match.winnerId === match.team1Id ? 'winner' : ''}"><span>${html(teamName(game,match.team1Id))}</span><strong>${scoreText(match.score1)}</strong></div><div class="${match.winnerId && match.winnerId === match.team2Id ? 'winner' : ''}"><span>${html(teamName(game,match.team2Id))}</span><strong>${scoreText(match.score2)}</strong></div></div>`).join('')}</section>`).join('')}</div>`;
}

function renderSchedule() {
  const games = selected.schedule === 'all' ? season.disciplines : [gameById(selected.schedule)];
  const matches = games.flatMap((game) => game.matches.map((match) => ({game,match}))).sort((a,b) => `${a.match.date} ${a.match.time}`.localeCompare(`${b.match.date} ${b.match.time}`));
  $('#schedule-body').innerHTML = matches.length ? matches.map(({game,match}) => `<tr><td>${html(shortDate(match.date))}</td><td>${html(match.time || 'Уточняется')}</td><td>${html(game.name)}</td><td>${html(teamName(game,match.team1Id))} <span class="muted">vs</span> ${html(teamName(game,match.team2Id))}</td><td>${html(match.stage)}</td></tr>`).join('') : '<tr><td colspan="5" class="empty-cell"><strong>Расписание готовится.</strong><p>Даты, время и пары команд появятся после жеребьёвки.</p></td></tr>';
}

function renderResults() {
  $('#results-grid').innerHTML = season.disciplines.map((game) => {
    const completed = game.matches.filter((match) => match.status === 'finished');
    return `<article class="result-card"><div class="result-card-top"><h3>${html(game.name)}</h3><span>${completed.length ? 'ЗАВЕРШЁННЫЕ МАТЧИ' : 'ОЖИДАЕМ МАТЧИ'}</span></div>${completed.length ? completed.map((match) => `<div class="result-line"><div><span>${html(teamName(game,match.team1Id))} / ${html(teamName(game,match.team2Id))}</span><strong>${scoreText(match.score1)} : ${scoreText(match.score2)}</strong></div>${match.advancedTeamId ? `<p>Дальше проходит ${html(teamName(game,match.advancedTeamId))}</p>` : `<p>${html(match.stage)}</p>`}</div>`).join('') : '<div class="result-card-empty"><span class="result-score">— : —</span><p>Результаты появятся<br>после завершения игр.</p></div>'}</article>`;
  }).join('');
}

function renderMedia() {
  $('#media-grid').innerHTML = season.media.length ? season.media.map((item) => {
    const source = html(safeUrl(item.src));
    const caption = html(item.caption);
    return item.type === 'video' ? `<article class="media-item"><video controls preload="none" ${item.poster ? `poster="${html(safeUrl(item.poster))}"` : ''}><source src="${source}" type="${html(item.mimeType || 'video/mp4')}">Ваш браузер не поддерживает видео.</video><p>${caption}</p></article>` : `<a class="media-item" href="${source}" target="_blank" rel="noopener"><img src="${source}" alt="${html(item.alt || item.caption)}" loading="lazy" width="600" height="400"><p>${caption} <span aria-hidden="true">↗</span></p></a>`;
  }).join('') : '<div class="media-placeholder"><span class="media-icon" aria-hidden="true">↗</span><strong>В кадре — команда.</strong><span>Фотографии с турнира / скоро</span></div><div class="media-placeholder"><span class="media-icon" aria-hidden="true">▷</span><strong>Лучшие моменты.</strong><span>Видео с турнира / скоро</span></div><div class="media-placeholder"><span class="media-icon" aria-hidden="true">✦</span><strong>Эмоции финала.</strong><span>После решающей игры</span></div>';
  $('.media-note').hidden = Boolean(season.media.length);
}

function renderWinners() {
  const winners = season.disciplines.filter((game) => game.winner);
  $('#winners').hidden = !winners.length;
  $('#winners-grid').innerHTML = winners.map((game) => {
    const team = game.teams.find((entry) => entry.id === game.winner.teamId);
    if (!team) return '';
    return `<article class="winner-card">${game.winner.photo ? `<img src="${html(safeUrl(game.winner.photo))}" alt="${html(team.name)} с кубком" loading="lazy">` : ''}<span>ПОБЕДИТЕЛЬ / ${html(game.name.toUpperCase())}</span><h3>${html(team.name)}</h3><ul>${team.players.map((player) => `<li>${html(player)}</li>`).join('')}</ul></article>`;
  }).join('');
}

function renderOrganizers() {
  $('#organizers-grid').innerHTML = season.organizers.map((person) => `<article class="organizer"><span class="organizer-role">${html(person.role.toUpperCase())}</span><p class="${person.name ? '' : 'pending'}">${html(person.name || 'Скоро представим')}</p></article>`).join('');
  $('#partners').hidden = !season.partners.length;
  $('#partners').innerHTML = season.partners.length ? `<h3>Партнёры</h3>${season.partners.map((partner) => `<p>${html(partner.name)}</p>`).join('')}` : '';
}

function renderSeason(year) {
  season = database.seasons.find((entry) => entry.year === year) || database.seasons.find((entry) => entry.year === database.currentSeason) || database.seasons[0];
  $('#season-select').value = season.year;
  document.title = `Кубок ИТиП ${season.year} — Dota 2 / CS2`;
  document.querySelectorAll('.season-year').forEach((node) => { node.textContent = season.year; });
  $('.hero-year').textContent = `/ ${season.year}`;
  $('#event-date').textContent = season.dateLabel;
  $('#event-date').dateTime = season.date;
  $('#event-venue').textContent = season.venue;
  $('#event-status').textContent = season.status;
  const regulationsUrl = safeUrl(season.regulationsUrl);
  $('#regulations').hidden = !regulationsUrl;
  $('#regulations-pending').hidden = Boolean(regulationsUrl);
  $('#regulations-note').hidden = Boolean(regulationsUrl);
  if (regulationsUrl) { $('#regulations').href = regulationsUrl; $('#regulations').target = '_blank'; $('#regulations').rel = 'noopener'; }
  renderTeams(); renderBracket(); renderSchedule(); renderResults(); renderMedia(); renderWinners(); renderOrganizers();
}

document.querySelectorAll('[data-tabs]').forEach((tablist) => {
  const activate = (tab) => {
    selected[tablist.dataset.tabs] = tab.dataset.game;
    tablist.querySelectorAll('[role=tab]').forEach((button) => { const active = button === tab; button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1; });
    if (season) (tablist.dataset.tabs === 'teams' ? renderTeams : renderBracket)();
  };
  tablist.addEventListener('click', (event) => { const tab = event.target.closest('[role=tab]'); if (tab) activate(tab); });
  tablist.addEventListener('keydown', (event) => {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault(); const tabs = [...tablist.querySelectorAll('[role=tab]')]; const index = tabs.indexOf(document.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    activate(tabs[next]); tabs[next].focus();
  });
});
document.querySelectorAll('[data-schedule]').forEach((button) => button.addEventListener('click', () => {
  selected.schedule = button.dataset.schedule;
  document.querySelectorAll('[data-schedule]').forEach((node) => { const active = node === button; node.classList.toggle('active',active); node.setAttribute('aria-pressed',String(active)); });
  if (season) renderSchedule();
}));
const closeMenu = () => { $('.menu-toggle').setAttribute('aria-expanded','false'); $('#mobile-nav').hidden = true; };
$('.menu-toggle').addEventListener('click', () => { const open = $('.menu-toggle').getAttribute('aria-expanded') !== 'true'; $('.menu-toggle').setAttribute('aria-expanded',String(open)); $('#mobile-nav').hidden = !open; });
$('#mobile-nav').addEventListener('click', (event) => { if (event.target.closest('a')) closeMenu(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeMenu(); });
window.addEventListener('resize', () => { if (window.innerWidth > 800) closeMenu(); });
$('#season-select').addEventListener('change', (event) => { renderSeason(event.target.value); const url = new URL(location.href); url.searchParams.set('season',season.year); history.replaceState(null,'',url); });

fetch('data/seasons.json').then((response) => { if (!response.ok) throw new Error('Season data unavailable'); return response.json(); }).then((data) => {
  database = data;
  $('#season-select').innerHTML = [...database.seasons].sort((a,b) => Number(b.year)-Number(a.year)).map((entry) => `<option value="${html(entry.year)}">Сезон ${html(entry.year)}</option>`).join('');
  renderSeason(new URL(location.href).searchParams.get('season') || database.currentSeason);
}).catch(() => { $('#load-error').hidden = false; });

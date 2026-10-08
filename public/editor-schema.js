export const sectionIds = ['hero','about','teams','bracket','schedule','results','media','winners','organizers','closing'];
export const categories = [
 ['general','Сайт и сезон','Название, дата, место и основные настройки'],
 ['appearance','Оформление','Цвета, шрифты, размеры и анимации'],
 ['header','Шапка и меню','Логотип, навигация и переключатель сезонов'],
 ['hero','Первый экран','Слоган, изображения, подписи и кнопка'],
 ['about','О турнире','Описание, дисциплины и регламент'],
 ['teams','Команды','Фотографии, названия и составы'],
 ['bracket','Турнирная сетка','Раунды, пары команд и счёт'],
 ['schedule','Расписание','Дата, время, этап и статус каждого матча'],
 ['results','Результаты','Счёт и команды, которые проходят дальше'],
 ['media','Медиа','Галерея, видео и подписи'],
 ['winners','Победители','Победители дисциплин и фотографии с кубками'],
 ['organizers','Организаторы','Люди, роли, контакты и партнёры'],
 ['footer','Финал и подвал','Завершающий экран, контакты и ссылки'],
 ['seasons','Сезоны и разделы','Архив, новый сезон, порядок и видимость блоков'],
 ['files','Файлы','Изображения, видео, регламент и шрифты'],
 ['advanced','Расширенные настройки','Собственный CSS и полные данные сайта'],
 ['history','История изменений','Резервные копии и восстановление']
];
export const defaults = {
 name:'Кубок ИТиП', description:'Кубок ИТиП — ежегодный чемпионат отделения информационных технологий и программирования по Dota 2 и CS2. Команды, расписание, турнирная сетка и медиа.', titleTemplate:'{name} {year} — {games}',
 logos:{header:'assets/logo.svg',hero:'assets/logo-combined.svg',mark:'assets/mark.svg',footer:'assets/logo.svg',closing:'assets/mark.svg',favicon:'assets/mark.svg'},
 colors:{accent:'#E4FD2A',secondary:'#0C4652',background:'#080A0B',surface:'#101416',text:'#F5F6F2',muted:'#9AA5A8',border:'#293033',header:'#080A0B'},
 fonts:{body:"'TT Travels',Arial,sans-serif",heading:"'Druk Text Wide Cyr','Arial Black',Arial,sans-serif",bodyFile:'',headingFile:''},
 layout:{containerWidth:1280,headerWidth:1180,headerRadius:27,sectionSpacing:88,heroLogoWidth:440},
 motion:{enabled:true,speed:1,tickerSeconds:32,floatSeconds:7,progress:true},
 header:{seasonLabel:'СЕЗОН',currentLabel:'Текущий сезон',archiveLabel:'Архив сезона',links:[{label:'О турнире',target:'about',desktop:true,mobile:true},{label:'Команды',target:'teams',desktop:true,mobile:true},{label:'Сетка',target:'bracket',desktop:true,mobile:true},{label:'Расписание',target:'schedule',desktop:true,mobile:true},{label:'Результаты',target:'results',desktop:false,mobile:true},{label:'Медиа',target:'media',desktop:true,mobile:true},{label:'Организаторы',target:'organizers',desktop:false,mobile:true}]},
 footer:{department:'Отделение информационных технологий\nи программирования',motto:'Ежегодно. Вместе.',links:[]},ticker:{enabled:true,items:['DOTA 2','CS2','КУБОК ИТиП']},customCSS:''
};
export const contentDefaults = {
 hero:{visible:true,eyebrow:'ЧЕМПИОНАТ ОТДЕЛЕНИЯ',tagline:'Твоя команда.\nТвоя игра. Твой кубок.',format:'5 × 5',button:'К командам',buttonUrl:'#teams',dateLabel:'ДАТА ПРОВЕДЕНИЯ',venueLabel:'МЕСТО ПРОВЕДЕНИЯ',seasonLabel:'СЕЗОН'},
 about:{visible:true,title:'Встречаемся\nна одной карте.',text:'Кубок ИТиП — ежегодный чемпионат отделения информационных технологий и программирования по Dota 2 и CS2.',secondaryText:'Собираем команды отделения, чтобы вместе пройти путь от первых матчей до финала. Две дисциплины. Командная игра. Один Кубок ИТиП.',regulationsLabel:'Регламент',regulationsNote:'Документ готовится к публикации'},
 teams:{visible:true,title:'В игре — команды.',intro:'Составы, лица и командный дух.',label:'СЕЗОН {year}',demoNote:'Пока здесь тестовые ростеры из брендбука. После фотосессии появятся реальные команды и составы.',demoBadge:'МАКЕТ',rosterLabel:'СОСТАВ КОМАНДЫ',empty:'Участники появятся после подтверждения составов.'},
 bracket:{visible:true,title:'Турнирная сетка.',label:'РАСКЛАД СИЛ',emptyText:'Здесь будут пары команд и результаты матчей.',soon:'СКОРО',unknownTeam:'Участник определится'},
 schedule:{visible:true,title:'Время играть.',label:'НЕ ПРОПУСТИ СВОЮ ИГРУ',all:'Все матчи',columns:['Дата','Время','Дисциплина','Матч','Этап'],emptyTitle:'Расписание готовится.',emptyText:'Даты, время и пары команд появятся после жеребьёвки.',unknown:'Уточняется'},
 results:{visible:true,title:'Кто идёт дальше.',label:'ИГРА РЕШАЕТ',subtitle:'Итоги завершённых матчей',completed:'ЗАВЕРШЁННЫЕ МАТЧИ',waiting:'ОЖИДАЕМ МАТЧИ',empty:'Результаты появятся\nпосле завершения игр.',advanced:'Дальше проходит'},
 media:{visible:true,title:'Моменты Кубка.',label:'БОЛЬШЕ, ЧЕМ ИГРА',subtitle:'Фото / Видео',intro:'Эмоции, которые не помещаются в счёт матча.',note:'Фотографии и видео появятся после отборочных матчей и финала.',background:'assets/banner.png',placeholders:[{title:'В кадре — команда.',caption:'Фотографии с турнира / скоро',icon:'↗'},{title:'Лучшие моменты.',caption:'Видео с турнира / скоро',icon:'▷'},{title:'Эмоции финала.',caption:'После решающей игры',icon:'✦'}]},
 winners:{visible:true,title:'Этот Кубок — ваш.',label:'ПОБЕДИТЕЛИ',badge:'ПОБЕДИТЕЛЬ',showBeforeFinal:false},
 organizers:{visible:true,title:'Делаем Кубок вместе.',label:'КОМАНДА ЗА КАДРОМ',pending:'Скоро представим',partnersTitle:'Партнёры'},
 closing:{visible:true,text:'До встречи\nв игре.',button:'К началу',buttonUrl:'#top'}
};
export const contentFields = {
 hero:[['eyebrow','Подпись над логотипом'],['tagline','Слоган','textarea'],['format','Формат игры'],['button','Текст кнопки'],['buttonUrl','Ссылка кнопки','url'],['dateLabel','Подпись даты'],['venueLabel','Подпись места'],['seasonLabel','Подпись сезона']],
 about:[['title','Заголовок','textarea'],['text','Основное описание','textarea'],['secondaryText','Второй абзац','textarea'],['regulationsLabel','Текст кнопки регламента'],['regulationsNote','Подпись, пока документ не загружен']],
 teams:[['title','Заголовок'],['intro','Описание','textarea'],['label','Подпись раздела'],['demoNote','Подпись тестовых карточек','textarea'],['demoBadge','Метка тестовой карточки'],['rosterLabel','Подпись состава'],['empty','Текст без команд','textarea']],
 bracket:[['title','Заголовок'],['label','Подпись раздела'],['emptyText','Текст до жеребьёвки','textarea'],['soon','Метка ожидания'],['unknownTeam','Название неизвестного участника']],
 schedule:[['title','Заголовок'],['label','Подпись раздела'],['all','Текст фильтра всех матчей'],['columns','Заголовки пяти колонок','lines'],['emptyTitle','Заголовок пустого расписания'],['emptyText','Описание пустого расписания','textarea'],['unknown','Неизвестные дата и время']],
 results:[['title','Заголовок'],['label','Подпись раздела'],['subtitle','Описание'],['completed','Метка завершённых матчей'],['waiting','Метка ожидания'],['empty','Текст без результатов','textarea'],['advanced','Подпись команды, прошедшей дальше']],
 media:[['title','Заголовок'],['label','Подпись раздела'],['subtitle','Виды материалов'],['intro','Описание','textarea'],['note','Подпись пустой галереи','textarea'],['background','Фон первой карточки пустой галереи','image']],
 winners:[['title','Заголовок'],['label','Подпись раздела'],['badge','Метка победителя'],['showBeforeFinal','Показывать блок до появления победителей','checkbox']],
 organizers:[['title','Заголовок'],['label','Подпись раздела'],['pending','Текст вместо неизвестного имени'],['partnersTitle','Заголовок партнёров']],
 closing:[['text','Финальный текст','textarea'],['button','Текст кнопки'],['buttonUrl','Ссылка кнопки','url']]
};
export const clone = (value) => structuredClone(value);
export function normalize(data) {
 const result=clone(data);result.schemaVersion=1;
 result.site={...clone(defaults),...result.site};
 for(const key of ['logos','colors','fonts','layout','motion','header','footer','ticker']) result.site[key]={...clone(defaults[key]),...result.site[key]};
 for(const season of result.seasons){season.order=season.order||clone(sectionIds);season.content=season.content||{};for(const id of sectionIds)season.content[id]={...clone(contentDefaults[id]),...season.content[id]};for(const game of season.disciplines)game.caption??=game.id==='dota2'?'Пять игроков. Один трон.':'Пять игроков. Одна цель.';}
 return result;
}

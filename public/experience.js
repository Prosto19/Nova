const page = document.body;
const stage = document.querySelector('#entry-stage');
const screen = document.querySelector('#entry-screen');
const roleLabels={student:'Студент',teacher:'Преподаватель',dean:'Сотрудник деканата'};
let selectedRole='student';
try{const savedRole=sessionStorage.getItem('nova-entry-role');if(roleLabels[savedRole])selectedRole=savedRole;}catch{}
const choices = {
 welcome: `<span class="entry-kicker">ЦИФРОВОЙ ДЕКАНАТ БУДУЩЕГО</span><h1>Привет. Я <strong>NOVA.</strong></h1><p class="entry-copy">Твой университет. Один диалог</p><div class="role-options"><button data-role="student"><span class="role-symbol">◇</span><b>Я студент</b><small>Учёба, расписание и документы</small><span class="role-arrow">↗</span></button><button data-role="teacher"><span class="role-symbol">⌘</span><b>Я преподаватель</b><small>Группы, занятия и оценки</small><span class="role-arrow">↗</span></button><button data-role="dean"><span class="role-symbol">▦</span><b>Я сотрудник деканата</b><small>Заявки и работа университета</small><span class="role-arrow">↗</span></button></div><p class="role-note">Выбор роли помогает подобрать сценарий. Доступ подтверждается отдельно.</p>`,
 register: `<div class="registration"><button class="reg-back" data-route="welcome">← К началу</button><div class="reg-orb" aria-hidden="true"><span></span></div><div class="reg-heading"><span class="entry-kicker">NOVA РЯДОМ</span><h1>Давайте познакомимся.</h1><p>Один диалог. Всё по порядку.</p></div><div id="reg-dialogue" aria-live="polite" aria-atomic="false"></div><div class="reg-bottom"><span class="reg-status-dot"></span> Ваш билет — начало знакомства, а не пароль</div></div>`,
 methods: `<button class="back-link" data-route="account">← Назад</button><span class="entry-kicker">РАДЫ ВАС ВИДЕТЬ</span><h1>С возвращением.</h1><p class="entry-copy">Как тебе удобнее войти?</p><div class="method-options"><button data-route="password"><span class="method-symbol">⌨</span><span><b>Логин и пароль</b><small>Войти на этом устройстве</small></span><span>↗</span></button><button data-route="passkey"><span class="method-symbol">◎</span><span><b>Ключ доступа</b><small>Passkey · подключим позже</small></span><span>↗</span></button><button data-route="qr"><span class="method-symbol">▦</span><span><b>С помощью телефона</b><small>QR-вход · подключим позже</small></span><span>↗</span></button></div>`,
 passkey:`<button class="back-link" data-route="methods">← Способы входа</button><span class="entry-kicker">КЛЮЧ ДОСТУПА</span><h1>Удобно. По-настоящему твоё.</h1><p class="entry-copy">Ключ доступа позволит подтвердить вход через Face ID, Touch ID, Windows Hello или PIN устройства.</p><div class="qr-pending"><b>Passkey пока не подключён</b><p>Нужна серверная проверка WebAuthn. Биометрические данные NOVA не собирает.</p></div><button class="primary" data-route="password">Перейти ко входу по паролю →</button>`,
 qr: `<button class="back-link" data-route="methods">← Способы входа</button><span class="entry-kicker">ВХОД ЧЕРЕЗ ТЕЛЕФОН</span><h1>Подтвердите, что это вы.</h1><p class="entry-copy">Отсканируйте QR-код телефоном, на котором<br>уже выполнен вход в NOVA.</p><div class="qr-pending"><span>▦</span><b>Подключение QR-входа — следующий этап</b><p>Для подтверждения потребуется активный аккаунт на телефоне. Сейчас доступен вход по паролю.</p></div><button class="primary" data-route="password">Войти по логину и паролю →</button>`
};
window.novaRoute = function(route){
 if(route==='register'&&selectedRole!=='student'){location.assign('/register/?role='+selectedRole);return;}
 if(route==='account')choices.account=`<button class="back-link" data-route="welcome">← Выбрать роль</button><span class="entry-kicker">${roleLabels[selectedRole].toUpperCase()}</span><h1>Продолжим знакомство.</h1><p class="entry-copy">У тебя уже есть аккаунт?</p><div class="entry-buttons account-actions"><button class="primary" data-route="methods">Да, войти <span>↗</span></button><button class="secondary" data-route="register">Нет, зарегистрироваться</button></div>`;
 page.dataset.screen=route;
 stage.hidden=!choices[route];
 document.querySelector('main').hidden=!!choices[route];
 document.querySelector('.sidebar').hidden=true;
 if(choices[route])screen.innerHTML=choices[route];
 if(route==='methods'&&selectedRole!=='student')screen.querySelector('[data-route="qr"]').hidden=true;
 if(route==='register'){
   renderRegistration('start');
 } else if(route==='password'){
   document.querySelector('.welcome h1').textContent='С возвращением в NOVA';
   document.querySelector('.welcome p').textContent=roleLabels[selectedRole]+' · роль и доступ подтверждаются аккаунтом';
   document.querySelector('#auth-card').hidden=false;
   document.querySelector('#greeting').textContent='Введите данные в форму ниже. Я получу только результат входа — ваш пароль останется между вами и системой.';
 }
 window.scrollTo(0,0);
};
document.addEventListener('click',e=>{const b=e.target.closest('[data-route]');if(b)window.novaRoute(b.dataset.route);});
document.addEventListener('click',e=>{const b=e.target.closest('[data-role]');if(b){selectedRole=b.dataset.role;try{sessionStorage.setItem('nova-entry-role',selectedRole);}catch{}window.novaRoute('account');}});
document.addEventListener('click',e=>{if(e.target.closest('[data-demo]') && document.querySelector('#success').hidden)window.novaRoute('password');},true);
window.novaRoute('welcome');

let registrationTimer;
const regScenes={
 start:{title:'Начнём со студенческого билета',text:'Удобнее продолжить на телефоне — там есть камера. Если ты уже регистрировался, я помогу вернуться в аккаунт. Если нет — познакомимся.',extra:'<a class="reg-local-link" href="/register/?role=student">Продолжить на этом устройстве ↗</a>',action:'Продолжить на телефоне',next:'handoff',hint:'Используй вымышленный или встроенный демонстрационный билет.'},
 handoff:{crumb:'Вы выбрали продолжение на телефоне',title:'Продолжим на вашем телефоне',text:'Откройте камеру телефона и наведите её на QR-код. NOVA встретит вас на мобильной странице.',extra:'<div id="registration-qr" class="qr-box" role="img" aria-label="QR-код мобильной регистрации"></div><div class="share-actions"><button id="copy-mobile-link">Скопировать ссылку</button><a id="open-mobile-link" target="_blank" rel="noopener">Открыть здесь ↗</a></div><p id="mobile-link-status" class="share-url" role="status"></p>',hint:'QR открывает демонстрацию, а не сессию входа. Продолжите на телефоне; автоматическая связь с ПК ещё не подключена.'},
 ticket:{crumb:'Продолжение на телефоне · пример',title:'Теперь ваш студенческий билет',text:'На телефоне здесь будет камера или загрузка изображения. Пока выберите вымышленный билет, чтобы посмотреть, как NOVA продолжит диалог.',extra:'<div class="ticket-options"><button data-reg="check-new"><span class="ticket-mark">N</span><span><b>Новый студент</b><small>Алексей Северин · NOVA-0103</small></span><span>↗</span></button><button data-reg="check-existing"><span class="ticket-mark">N</span><span><b>Уже есть аккаунт</b><small>Мария Волкова · NOVA-0102</small></span><span>↗</span></button></div>',hint:'Демонстрация. Настоящие документы не загружаются.'},
 new:{crumb:'Вымышленный билет выбран · данные проверены в примере',title:'Алексей, приятно познакомиться.',text:'В этом примере аккаунта ещё нет. Следующий шаг — подтвердить принадлежность билета. Затем создадим личный логин и настроим удобный вход.',extra:'<div class="identity-preview"><span class="identity-avatar">АС</span><div><b>Алексей Северин</b><small>Учебный университет NOVA · группа ЭК-101</small></div><span class="example-pill">Пример</span></div>',action:'Как будет устроен вход?',next:'setup',hint:'Сканирование билета само по себе не подтверждает личность.'},
 existing:{crumb:'Вымышленный билет выбран · пример существующего аккаунта',title:'Начинать заново не нужно.',text:'Если к билету уже привязан аккаунт, NOVA предложит подтвердить вход. Можно использовать ключ доступа на телефоне или свой логин и пароль.',extra:'<div class="found-note"><span>↗</span><p>Данные аккаунта откроются только после подтверждения. Фото билета не заменяет пароль.</p></div>',action:'Перейти ко входу',next:'login',hint:'В этом просмотре доступен рабочий вход по паролю.'},
 setup:{crumb:'Новый аккаунт · предпросмотр следующих шагов',title:'В следующий раз — одно касание.',text:'После активации вы получите личный логин, создадите резервный пароль и сможете настроить ключ доступа на телефоне. Затем подтвердите вход на этот компьютер.',extra:'<div class="setup-line"><span>Личный логин</span><i>→</i><span>Ключ доступа</span><i>→</i><span>Вход на ПК</span></div>',action:'Попробовать тестовый вход',next:'login',hint:'Это просмотр сценария: аккаунт и ключ доступа пока не создаются.'}
};
function renderRegistration(step){
 clearTimeout(registrationTimer);
 const host=document.querySelector('#reg-dialogue');if(!host)return;
 if(step==='login'){window.novaRoute('password');return;}
 if(step.startsWith('check-')){
   host.innerHTML='<div class="reg-crumb">✓ Вымышленный билет выбран</div><div class="reg-message"><span class="reg-speaker">NOVA</span><div class="reg-checking"><span class="typing-dots"><i></i><i></i><i></i></span><p>Смотрим, какой шаг будет следующим…</p></div></div>';
   registrationTimer=setTimeout(()=>{if(page.dataset.screen==='register')renderRegistration(step==='check-new'?'new':'existing');},1300);return;
 }
 const s=regScenes[step];
 host.innerHTML=`${s.crumb?`<div class="reg-crumb">✓ ${s.crumb}</div>`:''}<div class="reg-message"><span class="reg-speaker">NOVA <span>✦</span></span><h2>${s.title}</h2><p class="reg-message-text">${s.text}</p>${s.extra||''}${s.action?`<button class="reg-primary" data-reg="${s.next}">${s.action}<span>↗</span></button>`:''}<p class="reg-hint">${s.hint}</p></div><details class="help-inline"><summary>Нет билета или нужна помощь?</summary><div class="help-options"><button data-reg-help="lost">Потерял билет <span>↗</span></button><button data-reg-help="scan">Не получается отсканировать <span>↗</span></button><button data-reg-help="account">Не помню аккаунт <span>↗</span></button><button data-reg-help="phone">Нет доступа к телефону <span>↗</span></button></div><p class="reg-help-answer" role="status"></p></details>${step!=='start'?'<button class="reg-restart" data-reg="start">Начать диалог заново</button>':''}`;
 if(step==='handoff')drawMobileQR();
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-reg]');if(b)renderRegistration(b.dataset.reg);});
const mobilePublicURL=new URL('register/',new URL('.',document.currentScript.src)).href;
function drawMobileQR(){const link=document.querySelector('#open-mobile-link');link.href=mobilePublicURL;const host=document.querySelector('#registration-qr');try{const qr=qrcode(0,'M');qr.addData(mobilePublicURL);qr.make();host.innerHTML=qr.createSvgTag({cellSize:5,margin:20,scalable:true});}catch{host.textContent='Откройте мобильную версию по ссылке ниже.';}}
document.addEventListener('click',async e=>{if(e.target.id==='copy-mobile-link'){try{await navigator.clipboard.writeText(mobilePublicURL);document.querySelector('#mobile-link-status').textContent='Ссылка скопирована — можно отправить другу.';}catch{document.querySelector('#mobile-link-status').textContent=mobilePublicURL;}}const b=e.target.closest('[data-reg-help]');if(b){const answers={lost:'Альтернативная регистрация через подтверждение в деканате появится позже. Сейчас можно пройти демонстрацию с тестовым билетом.',scan:'На мобильной странице выберите загрузку изображения или готовый тестовый билет. Настоящие документы не нужны.',account:'На телефоне можно выбрать пример «Аккаунт уже есть» и посмотреть путь подтверждения. Повторная регистрация не нужна.',phone:'Откройте мобильную ссылку в этом браузере и используйте тестовый билет. Камера необязательна.'};b.closest('details').querySelector('.reg-help-answer').textContent=answers[b.dataset.regHelp];}});

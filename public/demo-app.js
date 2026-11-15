// The public preview has no authentication API. Never submit credentials.
const dialog=document.querySelector('#info-dialog');
function explain(title,text){document.querySelector('#info-title').textContent=title;document.querySelector('#info-text').textContent=text;dialog.showModal();}
document.querySelector('#login-form').addEventListener('submit',e=>{e.preventDefault();explain('Публичная демонстрация','Серверный вход доступен только в локальной версии проекта. Эта ссылка предназначена для просмотра регистрации. Настоящие логины и пароли вводить не нужно.');});
document.querySelector('#login').disabled=true;document.querySelector('#password').disabled=true;document.querySelector('#toggle-password').disabled=true;document.querySelector('#submit').textContent='О демонстрационном входе';document.querySelector('.secure-note').textContent='Публичный просмотр: вход в аккаунт не подключён';
document.querySelectorAll('[data-demo]').forEach(b=>b.hidden=true);
document.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',()=>explain('NOVA — демонстрация','Попробуйте путь «Начать по студенческому билету». Проверка личности, восстановление и создание аккаунта появятся с серверной частью.')));
document.querySelector('#close-dialog').onclick=document.querySelector('#dialog-ok').onclick=()=>dialog.close();

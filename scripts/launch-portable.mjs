import {spawn} from 'node:child_process';
import {server} from './server.mjs';

server.on('error', error => {
  console.error(error.message);
  process.exitCode = 1;
});
server.listen(0, '127.0.0.1', () => {
  const url = 'http://127.0.0.1:' + server.address().port;
  console.log('NOVA запущена. Держите это окно открытым.\n' + url);
  if (!process.argv.includes('--no-browser')) {
    const browser = spawn('explorer.exe', [url], {detached:true, stdio:'ignore'});
    browser.on('error', () => console.log('Откройте адрес выше в браузере.'));
    browser.unref();
  }
});

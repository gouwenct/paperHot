const http = require('http');
const fs = require('fs');
const path = require('path');
const file = path.resolve('E:/my2/codex-project/paperHot/.superpowers/brainstorm/codex-20260619195104/content/paperhot-config-interactive-cn.html');
const server = http.createServer((req, res) => {
  if (req.url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  fs.readFile(file, 'utf8', (err, html) => {
    if (err) { res.writeHead(500, {'Content-Type':'text/plain; charset=utf-8'}); res.end(String(err)); return; }
    res.writeHead(200, {'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store'});
    res.end(html);
  });
});
server.listen(50651, '127.0.0.1', () => console.log('paperhot config prototype http://localhost:50651/'));

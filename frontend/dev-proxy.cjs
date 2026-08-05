// Reverse proxy so the frontend is reachable at http://speckit.local instead
// of http://localhost:5173. Forwards plain HTTP and the WebSocket connection
// Vite uses for HMR (hot module reload) to the real Vite dev server, which
// keeps running on 5173 exactly as before - this just sits in front of it.
//
// One-time setup (needs an elevated/Administrator terminal, since editing
// the hosts file requires it): add a line to
// C:\Windows\System32\drivers\etc\hosts
//   127.0.0.1  speckit.local
//
// Binding to port 80 itself does NOT require Administrator on Windows
// (unlike Linux/macOS) - it'll fail instead if something else (IIS, Skype,
// another dev server, etc.) is already listening on port 80.

const http = require('http');
const httpProxy = require('http-proxy');

const TARGET = 'http://localhost:5173';
const PORT = 80;
const HOST = 'speckit.local';

const proxy = httpProxy.createProxyServer({ target: TARGET, ws: true });

proxy.on('error', (err, _req, res) => {
  console.error('[dev-proxy] error forwarding to', TARGET, '-', err.message);
  if (res && res.writeHead && !res.headersSent) {
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end(`Bad gateway - is the Vite dev server running on ${TARGET}? (run "npm run dev")`);
  }
});

const server = http.createServer((req, res) => proxy.web(req, res));
server.on('upgrade', (req, socket, head) => proxy.ws(req, socket, head));

server.on('error', (err) => {
  if (err.code === 'EACCES' || err.code === 'EADDRINUSE') {
    console.error(
      `[dev-proxy] Could not bind to port ${PORT} (${err.code}). ` +
        'Something else may already be using it - stop that process, or ' +
        'change PORT in dev-proxy.js.'
    );
  } else {
    console.error('[dev-proxy]', err.message);
  }
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`[dev-proxy] http://${HOST} -> ${TARGET} (listening on port ${PORT})`);
  console.log(`[dev-proxy] Make sure "127.0.0.1  ${HOST}" is in your hosts file and the Vite dev server is running.`);
});

// Serve the game for a quick play test: `node serve.ts` opens it at
// http://localhost:8080. Node 22 standard library only; it serves only
// the files under game/, nothing else, and never touches the network.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const gameDir = fileURLToPath(new URL('./game', import.meta.url));
const PORT = 8080;
const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
};

// Only files under game/ are served; anything else is a 404, so the
// server can never leak a sibling file by accident.
const server = createServer(async (req, res) => {
  const path = req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0];
  if (path.includes('..')) {
    res.writeHead(400);
    res.end('bad path');
    return;
  }
  try {
    const data = await readFile(join(gameDir, path));
    res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Skyline Ridge Run at http://localhost:${PORT}`);
});

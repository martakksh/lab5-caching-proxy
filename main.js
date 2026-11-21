const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs/promises');
const { Command } = require('commander');

const program = new Command();

program
  .requiredOption('-h, --host <address>', 'server host address')
  .requiredOption('-p, --port <number>', 'server port number')
  .requiredOption('-c, --cache <path>', 'path to cache directory');

program.parse(process.argv);
const options = program.opts();

const port = Number(options.port);
if (!options.host || !Number.isInteger(port) || port <= 0 || port > 65535) {
  console.error('Error: --port must be a valid integer between 1 and 65535');
  process.exit(1);
}

const cacheDir = path.resolve(options.cache);

async function startServer() {
  try {
    await fs.mkdir(cacheDir, { recursive: true });

    const server = http.createServer(async (req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Proxy server ready\n');
    });

    server.listen(port, options.host, () => {
      console.log(`Server running at http://${options.host}:${port}/ (cache: ${cacheDir})`);
    });
  } catch (err) {
    console.error('Startup error:', err.message);
    process.exit(1);
  }
}

startServer();
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs/promises');
const { Command } = require('commander');
const superagent = require('superagent');

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

function resolveCacheFilePath(rawUrl, host, portNum) {
  const parsedUrl = new URL(rawUrl, `http://${host}:${portNum}`);
  const match = /^\/([1-5]\d{2})$/.exec(parsedUrl.pathname);
  if (!match) {
    return null;
  }

  const statusCode = match[1];
  const fileName = `${statusCode}.jpg`;
  const resolvedPath = path.resolve(cacheDir, fileName);
  const cachePrefix = cacheDir.endsWith(path.sep) ? cacheDir : `${cacheDir}${path.sep}`;

  if (!resolvedPath.startsWith(cachePrefix)) {
    return null;
  }

  return { statusCode, filePath: resolvedPath };
}

async function handleGet(target, res) {
  try {
    const cachedImage = await fs.readFile(target.filePath);
    res.writeHead(200, {
      'Content-Type': 'image/jpeg',
      'X-Proxy-Source': 'cache',
    });
    res.end(cachedImage);
    return;
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }

  try {
    const response = await superagent
      .get(`https://http.cat/${target.statusCode}`)
      .responseType('buffer');

    const imageBuffer = Buffer.isBuffer(response.body)
      ? response.body
      : Buffer.from(response.body);

    await fs.writeFile(target.filePath, imageBuffer);

    res.writeHead(200, {
      'Content-Type': 'image/jpeg',
      'X-Proxy-Source': 'http.cat',
    });
    res.end(imageBuffer);
  } catch (err) {
    if (err.status === 404) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`Image for status ${target.statusCode} not found on http.cat\n`);
      return;
    }

    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`Failed to fetch image from http.cat: ${err.message}\n`);
  }
}

async function startServer() {
  try {
    await fs.mkdir(cacheDir, { recursive: true });

    const server = http.createServer(async (req, res) => {
      try {
        const target = resolveCacheFilePath(req.url || '/', options.host, port);
        if (!target) {
          res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Invalid path. Expected /<statusCode>, e.g. /200 or /404\n');
          return;
        }

        if (req.method === 'GET') {
          await handleGet(target, res);
          return;
        }

        res.writeHead(405, {
          Allow: 'GET, PUT, DELETE',
          'Content-Type': 'text/plain; charset=utf-8',
        });
        res.end(`Method ${req.method} not allowed\n`);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`Internal server error: ${err.message}\n`);
      }
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

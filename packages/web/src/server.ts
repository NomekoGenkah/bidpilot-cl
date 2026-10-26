import { createServer } from 'node:http';

const HOST = process.env.HOST ?? '127.0.0.1';
const PORT = Number(process.env.PORT ?? 3000);

const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>BidPilot CL</title>
  </head>
  <body>
    <h1>BidPilot CL</h1>
  </body>
</html>
`;

const server = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
});

server.listen(PORT, HOST, () => {
  console.info(`BidPilot CL en http://${HOST}:${PORT}`);
});

import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import proxyMiddleware, { isMethodAllowed } from './middleware';

/**
 * Dev-server twin of the Vercel middleware: the same method + path allow-list
 * for /ado and /vsrm, and the same pinned, read-only /jira/{site} proxy, so
 * local behaviour matches production.
 */
function edgeMiddlewareInDev(): Plugin {
  return {
    name: 'tooldock-edge-middleware',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? '';
        if (!/^\/(ado|vsrm|jira)\//.test(url)) return next();
        const pathname = url.split('?')[0]!;
        if (!url.startsWith('/jira/')) {
          if (req.method === 'OPTIONS' || isMethodAllowed(req.method ?? 'GET', pathname))
            return next();
          res.statusCode = 405;
          res.end('Method Not Allowed');
          return;
        }
        try {
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) {
            if (typeof v === 'string') headers.set(k, v);
          }
          const request = new Request(`http://localhost${url}`, {
            method: req.method,
            headers,
            body: req.method === 'POST' ? Buffer.concat(chunks) : undefined,
          });
          const out =
            (await proxyMiddleware(request)) ?? new Response('Not found', { status: 404 });
          res.statusCode = out.status;
          out.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await out.arrayBuffer()));
        } catch {
          res.statusCode = 502;
          res.end('Jira proxy error');
        }
      });
    },
  };
}

/**
 * The Azure DevOps REST API does not send CORS headers, so the browser cannot
 * call https://dev.azure.com directly. All app code calls the relative base
 * path `/ado/*`; in development this Vite proxy forwards those requests to
 * Azure DevOps. In production an equivalent reverse-proxy rewrite is used
 * (see vercel.json / netlify.toml / nginx.conf.example).
 *
 * The PAT only ever travels from the browser toward Azure DevOps via this
 * proxy. It is never stored or logged.
 */
export default defineConfig({
  plugins: [react(), edgeMiddlewareInDev()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // ExcelJS's main entry uses Node.js APIs (fs, stream, etc.) that don't
      // exist in the browser. Its pre-built browser bundle is safe to use.
      exceljs: path.resolve(__dirname, 'node_modules/exceljs/dist/exceljs.min.js'),
    },
  },
  // `npm run preview` serves the production headers, so the CSP can be tested locally.
  preview: {
    headers: Object.fromEntries(
      (
        JSON.parse(readFileSync(path.resolve(__dirname, 'vercel.json'), 'utf8')) as {
          headers: { headers: { key: string; value: string }[] }[];
        }
      ).headers[0]!.headers.filter((h) => h.key !== 'Strict-Transport-Security').map((h) => [
        h.key,
        h.value,
      ]),
    ),
  },
  server: {
    proxy: {
      '/ado': {
        target: 'https://dev.azure.com',
        changeOrigin: true,
        secure: true,
        rewrite: (p) => p.replace(/^\/ado/, ''),
        // Strip browser cookies before forwarding. The browser shares cookies
        // across all of localhost (any port), so unrelated dev-app cookies would
        // otherwise be sent to Azure DevOps and cause 400 Bad Request. ADO only
        // needs the Authorization (Basic PAT) header.
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.removeHeader('cookie');
          });
        },
      },
      // Release definitions live on vsrm.dev.azure.com (a separate ADO subdomain).
      '/vsrm': {
        target: 'https://vsrm.dev.azure.com',
        changeOrigin: true,
        secure: true,
        rewrite: (p) => p.replace(/^\/vsrm/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.removeHeader('cookie');
          });
        },
      },
    },
  },
});

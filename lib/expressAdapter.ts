import http from 'http';
import { Socket } from 'net';
import type { NextRequest } from 'next/server';
import type { Express } from 'express';

/**
 * Run the existing Express app (server.ts + server/routes) inside a Next.js Route Handler.
 * Preserves status codes and response headers. Does not use the CommonJS createRequire bridge.
 */
export function dispatchExpress(app: Express, request: NextRequest): Promise<Response> {
  return new Promise((resolve, reject) => {
    const finishBody = async () => {
      const url = new URL(request.url);
      const body =
        request.method === 'GET' || request.method === 'HEAD'
          ? Buffer.alloc(0)
          : Buffer.from(await request.arrayBuffer());

      const socket = new Socket();
      const req = new http.IncomingMessage(socket);
      req.method = request.method;
      req.url = `${url.pathname}${url.search}`;
      const headers: http.IncomingHttpHeaders = {};
      request.headers.forEach((value, key) => {
        headers[key] = value;
      });
      if (body.length > 0) headers['content-length'] = String(body.length);
      req.headers = headers;
      req.push(body);
      req.push(null);

      const res = new http.ServerResponse(req);
      const chunks: Buffer[] = [];
      let settled = false;

      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const outHeaders = new Headers();
        for (const [key, value] of Object.entries(res.getHeaders())) {
          if (value == null) continue;
          if (Array.isArray(value)) {
            for (const item of value) outHeaders.append(key, String(item));
          } else {
            outHeaders.set(key, String(value));
          }
        }
        resolve(
          new Response(Buffer.concat(chunks), {
            status: res.statusCode || 200,
            headers: outHeaders,
          })
        );
      };

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve(
          new Response(
            JSON.stringify({
              success: false,
              error: { message: 'API timed out', code: 'API_TIMEOUT' },
            }),
            { status: 504, headers: { 'Content-Type': 'application/json' } }
          )
        );
      }, 28000);

      res.write = ((chunk: any, encoding?: any, cb?: any) => {
        if (chunk && typeof chunk !== 'function') {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        if (typeof encoding === 'function') encoding();
        if (typeof cb === 'function') cb();
        return true;
      }) as typeof res.write;

      res.end = ((chunk?: any, encoding?: any, cb?: any) => {
        if (chunk && typeof chunk !== 'function') {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        if (typeof chunk === 'function') chunk();
        if (typeof encoding === 'function') encoding();
        if (typeof cb === 'function') cb();
        finish();
        return res;
      }) as typeof res.end;

      try {
        const maybe = app(req, res) as unknown;
        if (maybe && typeof (maybe as Promise<unknown>).then === 'function') {
          (maybe as Promise<unknown>).catch((err) => {
            if (!settled) {
              settled = true;
              clearTimeout(timer);
              reject(err);
            }
          });
        }
      } catch (err) {
        clearTimeout(timer);
        reject(err);
      }
    };

    finishBody().catch(reject);
  });
}

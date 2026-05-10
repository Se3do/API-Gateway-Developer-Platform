import http from 'http';
import https from 'https';
import { URL } from 'url';

export interface HttpClientResponse {
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  body: any;
}

export function httpRequest(url: string, method: string = 'GET', body?: any, headers?: Record<string, string>): Promise<HttpClientResponse> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options: http.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    if (body && method !== 'GET') {
      const bodyStr = JSON.stringify(body);
      options.headers = { ...options.headers, 'Content-Length': Buffer.byteLength(bodyStr).toString() };
    }

    const lib = parsedUrl.protocol === 'https:' ? https : http;

    const req = lib.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        try {
          resolve({
            statusCode: res.statusCode || 500,
            headers: res.headers,
            body: raw ? JSON.parse(raw) : null,
          });
        } catch {
          resolve({ statusCode: res.statusCode || 500, headers: res.headers, body: raw });
        }
      });
    });

    req.on('error', reject);

    if (body && method !== 'GET') {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

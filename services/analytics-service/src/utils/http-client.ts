import http from 'http';

export function httpRequest(url: string, method: string = 'GET', body?: any, headers?: Record<string, string>, timeoutMs: number = 1000): Promise<{ statusCode: number; body: any }> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const bodyStr = body ? JSON.stringify(body) : undefined;
    const options: http.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 80,
      path: parsedUrl.pathname + parsedUrl.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr).toString() } : {}),
      },
    };

    const req = http.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        try {
          resolve({ statusCode: res.statusCode || 500, body: raw ? JSON.parse(raw) : null });
        } catch {
          resolve({ statusCode: res.statusCode || 500, body: raw });
        }
      });
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Request timed out after ${timeoutMs}ms`));
    });

    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

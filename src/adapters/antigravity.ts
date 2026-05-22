import { Request, Response } from 'express';
import { ProviderConfig } from '../types';
import { getNextKey } from '../lb/round_robin';

export async function handleAntigravityProxy(req: Request, res: Response, providerName: string, config: ProviderConfig) {
  const apiKey = getNextKey(providerName, config);
  const baseUrl = config.base_url.replace(/\/+$/, '');
  const endpoint = `${baseUrl}/v1/messages`;
  const isStream = req.body.stream === true;

  try {
    const fetchResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(req.body),
    });

    if (!fetchResponse.ok) {
      const errBody = await fetchResponse.text();
      let parsed: any;
      try {
        parsed = JSON.parse(errBody);
      } catch {
        parsed = { message: errBody };
      }
      return res.status(fetchResponse.status).json({
        error: {
          type: 'api_error',
          message: `Antigravity proxy error: ${parsed.message || parsed.error?.message || errBody}`,
        },
      });
    }

    if (!isStream) {
      const data = await fetchResponse.json();
      return res.json(data);
    }

    // Streaming: passthrough SSE events
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    if (!fetchResponse.body) {
      return res.end();
    }

    const reader = fetchResponse.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        res.write(line + '\n');
      }
    }

    if (buffer) res.write(buffer);
    res.end();

  } catch (err: any) {
    if (err.cause?.code === 'ECONNREFUSED' || err.message?.includes('connect')) {
      console.error(`[Antigravity] Connection refused to ${endpoint}`);
      if (!res.headersSent) {
        return res.status(502).json({
          error: {
            type: 'proxy_error',
            message: `Antigravity proxy at ${baseUrl} is not running. Please start Antigravity Manager first.`,
          },
        });
      }
    }

    console.error(`[Antigravity Adapter] Error:`, err.message);
    if (!res.headersSent) {
      res.status(500).json({
        error: { type: 'internal_error', message: 'Antigravity proxy error: ' + err.message },
      });
    } else {
      res.end();
    }
  }
}

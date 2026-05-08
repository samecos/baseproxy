import { Request, Response } from 'express';
import { ModelConfig } from '../types';
import { getNextKey } from '../lb/round_robin';

export async function handleAnthropicProxy(req: Request, res: Response, modelName: string, config: ModelConfig) {
  const apiKey = getNextKey(modelName, config);
  const endpoint = config.endpoint;

  try {
    const fetchResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'x-api-key': apiKey, // some APIs prefer this
        'anthropic-version': '2023-06-01' // Standard anthropic header
      },
      body: JSON.stringify(req.body)
    });

    res.status(fetchResponse.status);

    // Copy headers
    fetchResponse.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    if (!fetchResponse.body) {
      return res.end();
    }

    // Stream the response body directly back to the client
    // Since it's Anthropic format to Anthropic format, no parsing is needed
    if (fetchResponse.body instanceof ReadableStream) {
      const reader = fetchResponse.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      res.end();
    } else {
      const text = await fetchResponse.text();
      res.send(text);
    }
  } catch (err: any) {
    console.error(`[Anthropic Adapter] Error proxying to ${modelName}:`, err.message);
    res.status(500).json({
      error: {
        type: 'api_error',
        message: 'Internal server error while proxying to upstream.'
      }
    });
  }
}

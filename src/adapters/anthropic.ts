import { Request, Response } from 'express';
import { ProviderConfig } from '../types';
import { getNextKey } from '../lb/round_robin';

export async function handleAnthropicProxy(req: Request, res: Response, providerName: string, config: ProviderConfig) {
  const apiKey = getNextKey(providerName, config);
  const endpoint = config.base_url;

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

    const isStream = req.body.stream === true;

    // Copy headers safely, avoiding ones that break Node's native streaming
    fetchResponse.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (!['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(lowerKey)) {
        res.setHeader(key, value);
      }
    });

    if (!fetchResponse.body) {
      return res.end();
    }

    // Stream the response body directly back to the client
    if (fetchResponse.body instanceof ReadableStream) {
      if (isStream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders(); // Force headers to be sent immediately
      }

      const reader = fetchResponse.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      const reqStr = JSON.stringify(req.body.messages || []) + JSON.stringify(req.body.system || "");
      const estimatedInputTokens = Math.ceil(reqStr.length / 3.5);
      let estimatedOutputTokens = 0;
      let hasSeenMessageDelta = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event: message_delta')) {
            hasSeenMessageDelta = true;
          }
          if (line.startsWith('event: message_stop') && !hasSeenMessageDelta) {
            // 自动补齐缺失的用量信息 (message_delta)
            const fakeData = JSON.stringify({
              type: 'message_delta',
              delta: { stop_reason: 'end_turn', stop_sequence: null },
              usage: { output_tokens: estimatedOutputTokens }
            });
            res.write(`event: message_delta\ndata: ${fakeData}\n\n`);
          }

          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim();
            if (dataStr && dataStr !== '[DONE]') {
              try {
                const parsed = JSON.parse(dataStr);
                
                // 拦截并补全 message_start 的 input_tokens
                if (parsed.type === 'message_start') {
                  if (!parsed.message.usage) {
                    parsed.message.usage = { input_tokens: estimatedInputTokens, output_tokens: 0 };
                    res.write(`data: ${JSON.stringify(parsed)}\n`);
                    continue;
                  }
                }
                
                // 累计 output_tokens
                if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                  estimatedOutputTokens += Math.ceil(parsed.delta.text.length / 3.5);
                }
                
              } catch (e) {
                // 解析失败说明是不完整的 chunk，直接忽略，原文透传
              }
            }
          }
          res.write(line + '\n');
        }
      }
      if (buffer) res.write(buffer);
      res.end();
    } else {
      const text = await fetchResponse.text();
      res.send(text);
    }
  } catch (err: any) {
    console.error(`[Anthropic Adapter] Error proxying to ${providerName}:`, err.message);
    res.status(500).json({
      error: {
        type: 'api_error',
        message: 'Internal server error while proxying to upstream.'
      }
    });
  }
}

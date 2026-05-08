import { Request, Response } from 'express';
import { ProviderConfig, AnthropicRequest, OpenAIMessage } from '../types';
import { getNextKey } from '../lb/round_robin';

export async function handleOpenAIProxy(req: Request, res: Response, providerName: string, config: ProviderConfig) {
  const apiKey = getNextKey(providerName, config);
  const endpoint = config.base_url;

  const anthropicReq = req.body as AnthropicRequest;
  const isStream = !!anthropicReq.stream;

  // 1. Translate Request
  const openAIMessages: OpenAIMessage[] = [];
  
  if (anthropicReq.system) {
    openAIMessages.push({
      role: 'system',
      content: anthropicReq.system
    });
  }

  for (const msg of anthropicReq.messages || []) {
    let contentStr = '';
    if (typeof msg.content === 'string') {
      contentStr = msg.content;
    } else if (Array.isArray(msg.content)) {
      contentStr = msg.content.map(c => c.text || '').join('');
    }
    openAIMessages.push({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: contentStr
    });
  }

  const openAIReqBody = {
    model: anthropicReq.model,
    messages: openAIMessages,
    stream: isStream,
    temperature: anthropicReq.temperature,
    max_tokens: anthropicReq.max_tokens,
    stream_options: isStream ? { include_usage: true } : undefined
  };

  // Estimate input tokens for message_start (OpenAI streaming only returns usage at the end)
  const reqStr = JSON.stringify(openAIMessages);
  const estimatedInputTokens = Math.ceil(reqStr.length / 3.5);

  try {
    const fetchResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(openAIReqBody)
    });

    if (!fetchResponse.ok) {
      const errText = await fetchResponse.text();
      return res.status(fetchResponse.status).json({
        error: {
          type: 'api_error',
          message: `Upstream OpenAI error: ${errText}`
        }
      });
    }

    if (!isStream) {
      // Handle non-streaming response
      const data = await fetchResponse.json();
      const content = data.choices?.[0]?.message?.content || '';
      const anthropicRes = {
        id: data.id || `msg_${Date.now()}`,
        type: 'message',
        role: 'assistant',
        model: data.model || anthropicReq.model,
        content: [
          {
            type: 'text',
            text: content
          }
        ],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: {
          input_tokens: data.usage?.prompt_tokens || 0,
          output_tokens: data.usage?.completion_tokens || 0
        }
      };
      return res.json(anthropicRes);
    }

    // Handle streaming response
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders(); // Force headers to be sent immediately

    if (!fetchResponse.body) {
      return res.end();
    }

    // Generate a message ID
    const msgId = `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    // Emit Anthropic Stream Start Events
    const emitEvent = (event: string, data: any) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    emitEvent('message_start', {
      type: 'message_start',
      message: {
        id: msgId,
        type: 'message',
        role: 'assistant',
        model: anthropicReq.model,
        content: [],
        usage: { input_tokens: estimatedInputTokens, output_tokens: 0 }
      }
    });

    emitEvent('content_block_start', {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'text', text: '' }
    });

    const reader = fetchResponse.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let finalOutputTokens = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep the last incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        
        const dataStr = trimmed.slice(6);
        if (dataStr === '[DONE]') continue;

        try {
          const parsed = JSON.parse(dataStr);
          const delta = parsed.choices?.[0]?.delta?.content;
          
          if (parsed.usage) {
            finalOutputTokens = parsed.usage.completion_tokens || 0;
          }

          if (delta) {
            emitEvent('content_block_delta', {
              type: 'content_block_delta',
              index: 0,
              delta: {
                type: 'text_delta',
                text: delta
              }
            });
          }
        } catch (e) {
          // ignore parse error for incomplete chunks
        }
      }
    }

    // Emit Anthropic Stream End Events
    emitEvent('content_block_stop', {
      type: 'content_block_stop',
      index: 0
    });

    emitEvent('message_delta', {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn', stop_sequence: null },
      usage: { output_tokens: finalOutputTokens }
    });

    emitEvent('message_stop', {
      type: 'message_stop'
    });

    res.end();

  } catch (err: any) {
    console.error(`[OpenAI Adapter] Error proxying to ${providerName}:`, err.message);
    res.status(500).json({
      error: {
        type: 'api_error',
        message: 'Internal server error while proxying to upstream.'
      }
    });
  }
}

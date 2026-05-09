import { Request, Response } from 'express';
import { ProviderConfig } from '../types';
import { getNextKey } from '../lb/round_robin';

function mapAnthropicToGemini(anthropicReq: any) {
  const geminiReq: any = {
    contents: []
  };

  // 1. Map System Prompt
  if (anthropicReq.system) {
    const systemText = Array.isArray(anthropicReq.system) 
      ? anthropicReq.system.map((s: any) => s.text).join('\n')
      : anthropicReq.system;
      
    geminiReq.systemInstruction = {
      parts: [{ text: systemText }]
    };
  }

  // 2. Map Messages
  for (const msg of anthropicReq.messages || []) {
    let role = msg.role;
    if (role === 'assistant') role = 'model';
    
    let parts: any[] = [];
    if (typeof msg.content === 'string') {
      parts.push({ text: msg.content });
    } else if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === 'text') {
          parts.push({ text: block.text });
        } else if (block.type === 'image') {
          parts.push({
            inlineData: {
              mimeType: block.source.media_type,
              data: block.source.data
            }
          });
        }
      }
    }

    geminiReq.contents.push({ role, parts });
  }

  // 3. Generation Config
  geminiReq.generationConfig = {};
  if (anthropicReq.max_tokens) {
    geminiReq.generationConfig.maxOutputTokens = anthropicReq.max_tokens;
  }
  if (anthropicReq.temperature !== undefined) {
    geminiReq.generationConfig.temperature = anthropicReq.temperature;
  }
  if (anthropicReq.top_p !== undefined) {
    geminiReq.generationConfig.topP = anthropicReq.top_p;
  }
  if (anthropicReq.top_k !== undefined) {
    geminiReq.generationConfig.topK = anthropicReq.top_k;
  }
  if (anthropicReq.stop_sequences) {
    geminiReq.generationConfig.stopSequences = anthropicReq.stop_sequences;
  }

  return geminiReq;
}

export async function handleGeminiProxy(req: Request, res: Response, providerName: string, config: ProviderConfig) {
  const apiKey = getNextKey(providerName, config);
  const baseUrl = config.base_url || 'https://generativelanguage.googleapis.com';
  const isStream = req.body.stream === true;
  
  // Always use streamGenerateContent with alt=sse for streaming
  const action = isStream ? 'streamGenerateContent?alt=sse' : 'generateContent';
  const targetUrl = `${baseUrl}/v1beta/models/${req.body.model}:${action}&key=${apiKey}`;

  try {
    const geminiBody = mapAnthropicToGemini(req.body);

    const fetchResponse = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(geminiBody)
    });

    if (!fetchResponse.ok) {
      const errText = await fetchResponse.text();
      return res.status(fetchResponse.status).json({
        error: {
          type: 'api_error',
          message: `Gemini API Error: ${errText}`
        }
      });
    }

    if (!isStream) {
      const data = await fetchResponse.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      
      const inputTokens = data.usageMetadata?.promptTokenCount || 0;
      const outputTokens = data.usageMetadata?.candidatesTokenCount || 0;

      return res.json({
        id: `msg_gemini_${Date.now()}`,
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text }],
        model: req.body.model,
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: {
          input_tokens: inputTokens,
          output_tokens: outputTokens
        }
      });
    }

    // --- Stream Handling ---
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const messageId = `msg_gemini_${Date.now()}`;
    let sentStart = false;

    if (!fetchResponse.body) {
      throw new Error('No body in response');
    }

    const reader = fetchResponse.body.getReader();
    const decoder = new TextDecoder('utf8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const dataStr = line.replace('data: ', '').trim();
        if (!dataStr) continue;

        try {
          const chunk = JSON.parse(dataStr);
          const partText = chunk.candidates?.[0]?.content?.parts?.[0]?.text || '';
          const finishReason = chunk.candidates?.[0]?.finishReason;
          const usage = chunk.usageMetadata;

          if (!sentStart) {
            res.write(`event: message_start\ndata: ${JSON.stringify({
              type: 'message_start',
              message: {
                id: messageId,
                type: 'message',
                role: 'assistant',
                model: req.body.model,
                content: [],
                stop_reason: null,
                stop_sequence: null,
                usage: { input_tokens: usage?.promptTokenCount || 0, output_tokens: 0 }
              }
            })}\n\n`);

            res.write(`event: content_block_start\ndata: ${JSON.stringify({
              type: 'content_block_start',
              index: 0,
              content_block: { type: 'text', text: '' }
            })}\n\n`);

            sentStart = true;
          }

          if (partText) {
            res.write(`event: content_block_delta\ndata: ${JSON.stringify({
              type: 'content_block_delta',
              index: 0,
              delta: { type: 'text_delta', text: partText }
            })}\n\n`);
          }

          if (finishReason || (usage && usage.candidatesTokenCount > 0 && partText === '')) {
             // Sometimes Gemini sends the final usage metadata in a separate chunk with no text.
             // If finishReason is STOP or we seem to be at the end, we send message_delta with usage.
             // But we only want to do this once, let's just do it when we see usage and finishReason
          }

          // In Gemini SSE, the final usage is often sent. We can send message_delta
          if (usage && finishReason) {
             res.write(`event: message_delta\ndata: ${JSON.stringify({
                type: 'message_delta',
                delta: { stop_reason: 'end_turn' },
                usage: { output_tokens: usage.candidatesTokenCount || 0 }
             })}\n\n`);
          }

        } catch (e) {
          console.error('[Gemini SSE Parse Error]', e, dataStr);
        }
      }
    }

    res.write(`event: message_stop\ndata: {"type": "message_stop"}\n\n`);
    res.end();

  } catch (err: any) {
    console.error('[Gemini Proxy Error]', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.end();
    }
  }
}

import express from 'express';
import cors from 'cors';
import { getConfig } from './config';
import { authMiddleware } from './middleware/auth';
import { handleAnthropicProxy } from './adapters/anthropic';
import { handleOpenAIProxy } from './adapters/openai';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' })); // Support large payloads

// Health check
app.get('/', (req, res) => {
  res.send('BaseProxy is running.');
});

// The main proxy endpoint (Anthropic format)
app.post('/v1/messages', authMiddleware, async (req, res) => {
  try {
    const config = getConfig();
    const modelName = req.body.model;

    if (!modelName) {
      return res.status(400).json({
        error: { type: 'invalid_request_error', message: 'model is required in the request body.' }
      });
    }

    const modelConfig = config.models[modelName];

    if (!modelConfig) {
      return res.status(404).json({
        error: { type: 'not_found_error', message: `Model '${modelName}' not found in configuration.` }
      });
    }

    // Route to appropriate adapter
    if (modelConfig.type === 'anthropic') {
      await handleAnthropicProxy(req, res, modelName, modelConfig);
    } else if (modelConfig.type === 'openai') {
      await handleOpenAIProxy(req, res, modelName, modelConfig);
    } else {
      return res.status(500).json({
        error: { type: 'internal_error', message: `Unknown model type: ${(modelConfig as any).type}` }
      });
    }

  } catch (err: any) {
    console.error('[Router Error]', err);
    res.status(500).json({
      error: { type: 'internal_error', message: err.message }
    });
  }
});

app.listen(PORT, () => {
  console.log(`[BaseProxy] Server listening on port ${PORT}`);
});

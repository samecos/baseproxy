import express from 'express';
import cors from 'cors';
import { getConfig } from './config';
import { authMiddleware } from './middleware/auth';
import { handleAnthropicProxy } from './adapters/anthropic';
import { handleOpenAIProxy } from './adapters/openai';
import { handleGeminiProxy } from './adapters/gemini';
import { handleAntigravityProxy } from './adapters/antigravity';
import { fetchProviderBalance } from './usage';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' })); // Support large payloads

// Health check
app.get('/', (req, res) => {
  res.send('BaseProxy is running.');
});

// Unified Usage/Balance API for cc-switch
app.all('/usage', authMiddleware, async (req, res) => {
  const config = getConfig();
  const targetModel = (req.headers['x-model'] || req.query.model) as string;

  let providersToQuery = Object.entries(config.providers);

  if (targetModel) {
    const matchedProvider = providersToQuery.find(([_, pConfig]) => pConfig.models.includes(targetModel));
    if (matchedProvider) {
      providersToQuery = [matchedProvider];
    } else {
      return res.status(404).json({ error: `Provider for model '${targetModel}' not found in config` });
    }
  }

  let totalRemaining = 0;
  const details: Record<string, number> = {};
  let currentUnit = 'CNY';
  let rootTiers: any[] = [];

  try {
    const fetchPromises = providersToQuery.map(async ([pName, pConfig]) => {
      const result = await fetchProviderBalance(pName, pConfig);
      details[pName] = result.balance;
      totalRemaining += result.balance;
      
      if (result.metadata?.tiers) {
        rootTiers = rootTiers.concat(result.metadata.tiers);
      }
      
      if (pName.toLowerCase().includes('kimi')) {
        currentUnit = 'Requests';
      } else if (pName.toLowerCase().includes('deepseek')) {
        currentUnit = 'CNY';
      } else if (pName.toLowerCase().includes('gemini') || pConfig.type === 'gemini') {
        currentUnit = 'Free Tier';
      }
    });

    await Promise.all(fetchPromises);

    res.json({
      isValid: true,
      balance: totalRemaining,
      unit: providersToQuery.length === 1 ? currentUnit : 'Mixed',
      details,
      tiers: rootTiers.length > 0 ? rootTiers : undefined
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
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

    let targetProvider: string | null = null;
    let providerConfig: any = null;

    for (const [providerName, pConfig] of Object.entries(config.providers)) {
      if (pConfig.models.includes(modelName)) {
        targetProvider = providerName;
        providerConfig = pConfig;
        break;
      }
    }

    if (!providerConfig) {
      return res.status(404).json({
        error: { type: 'not_found_error', message: `Model '${modelName}' not found in any provider configuration.` }
      });
    }

    // Route to appropriate adapter
    if (providerConfig.type === 'anthropic') {
      await handleAnthropicProxy(req, res, targetProvider!, providerConfig);
    } else if (providerConfig.type === 'openai') {
      await handleOpenAIProxy(req, res, targetProvider!, providerConfig);
    } else if (providerConfig.type === 'gemini') {
      await handleGeminiProxy(req, res, targetProvider!, providerConfig);
    } else if (providerConfig.type === 'antigravity') {
      await handleAntigravityProxy(req, res, targetProvider!, providerConfig);
    } else {
      return res.status(500).json({
        error: { type: 'internal_error', message: `Unknown provider type: ${providerConfig.type}` }
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

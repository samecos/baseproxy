import { ModelConfig } from '../types';

// In-memory cursor map: modelName -> current index
const cursors: Record<string, number> = {};

export function getNextKey(modelName: string, config: ModelConfig): string {
  if (!config.keys || config.keys.length === 0) {
    throw new Error(`No keys configured for model: ${modelName}`);
  }
  
  if (config.keys.length === 1) {
    return config.keys[0];
  }

  if (cursors[modelName] === undefined) {
    cursors[modelName] = 0;
  }

  const currentIdx = cursors[modelName];
  const key = config.keys[currentIdx];
  
  // Advance cursor
  cursors[modelName] = (currentIdx + 1) % config.keys.length;
  
  return key;
}

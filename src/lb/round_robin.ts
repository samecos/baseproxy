import { ProviderConfig } from '../types';

// In-memory cursor map: providerName -> current index
const cursors: Record<string, number> = {};

export function getNextKey(providerName: string, config: ProviderConfig): string {
  if (!config.keys || config.keys.length === 0) {
    throw new Error(`No keys configured for provider: ${providerName}`);
  }
  
  if (config.keys.length === 1) {
    return config.keys[0];
  }

  if (cursors[providerName] === undefined) {
    cursors[providerName] = 0;
  }

  const currentIdx = cursors[providerName];
  const key = config.keys[currentIdx];
  
  // Advance cursor
  cursors[providerName] = (currentIdx + 1) % config.keys.length;
  
  return key;
}

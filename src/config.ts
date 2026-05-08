import fs from 'fs';
import path from 'path';
import { Config } from './types';

const configPath = path.resolve(__dirname, '../config.json');

let configCache: Config | null = null;
let lastModified = 0;

export function getConfig(): Config {
  try {
    const stats = fs.statSync(configPath);
    if (stats.mtimeMs > lastModified || !configCache) {
      const data = fs.readFileSync(configPath, 'utf-8');
      configCache = JSON.parse(data) as Config;
      lastModified = stats.mtimeMs;
      console.log('[Config] Configuration loaded / updated.');
    }
    return configCache;
  } catch (err) {
    console.error('[Config Error] Failed to load config.json', err);
    if (!configCache) {
      throw new Error('Initial config load failed. Cannot start proxy.');
    }
    return configCache; // return stale cache if reload fails
  }
}

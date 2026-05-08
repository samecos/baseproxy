import * as fs from 'fs';

async function testKeys() {
  const data = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
  const key = data.providers.kimi.keys[0];
  console.log("Using Key:", key.substring(0, 15) + '...');

  const endpoints = [
    'https://api.moonshot.cn/v1/users/me/balance',
    'https://api.kimi.com/coding/v1/users/me/balance',
    'https://api.kimi.com/v1/users/me/balance',
    'https://api.kimi.com/coding/user/balance',
    'https://api.kimi.com/coding/usage',
    'https://api.kimi.com/coding/v1/dashboard/billing/usage'
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, { headers: { 'Authorization': `Bearer ${key}` } });
      const text = await res.text();
      console.log(`[${res.status}] ${url} -> ${text.substring(0, 100)}`);
    } catch (e: any) {
      console.log(`[Error] ${url} -> ${e.message}`);
    }
  }
}

testKeys();

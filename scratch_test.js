const fs = require('fs');

async function testKeys() {
  const data = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
  const key = data.providers.kimi.keys[0];

  const url = 'https://api.kimi.com/coding/v1/usages';
  try {
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${key}` } });
    const text = await res.text();
    console.log(`[${res.status}] ${url} -> ${text}`);
  } catch (e) {
    console.log(`[Error] ${url} -> ${e.message}`);
  }
}

testKeys();

const https = require('https');

const postData = JSON.stringify({
  contents: [{ parts: [{ text: "Hello" }] }]
});

const options = {
  hostname: 'generativelanguage.googleapis.com',
  path: '/v1beta/models/gemini-2.5-pro:generateContent?key=AIzaSyCqNV-ZNJE7Zgttm2ox7IGTERE3QYKFC8I',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log(data));
});

req.on('error', e => console.error(e));
req.write(postData);
req.end();

const https = require('https');

https.get('https://generativelanguage.googleapis.com/v1beta/models?key=AIzaSyCqNV-ZNJE7Zgttm2ox7IGTERE3QYKFC8I', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      if (json.models) {
        const names = json.models.map(m => m.name.replace('models/', ''));
        console.log("Available Gemini Models:\n", names.filter(n => n.includes('gemini')).join('\n'));
      } else {
        console.log("Response:", json);
      }
    } catch (e) {
      console.log("Raw Response:", data);
    }
  });
}).on('error', err => console.log('Error:', err.message));

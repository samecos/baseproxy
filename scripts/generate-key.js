const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 生成一个安全的随机 API Key
const generateApiKey = () => {
  const prefix = 'sk-proxy-';
  const randomBytes = crypto.randomBytes(32).toString('hex');
  return `${prefix}${randomBytes}`;
};

const main = () => {
  // 定位到根目录的 config.json
  const configPath = path.resolve(__dirname, '../config.json');
  
  if (!fs.existsSync(configPath)) {
    console.error('❌ 错误: 未找到 config.json 文件！请确保你在项目根目录下运行此脚本。');
    process.exit(1);
  }

  try {
    const configData = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(configData);

    const newKey = generateApiKey();

    // 确保 auth 和 valid_tokens 结构存在
    if (!config.auth) {
      config.auth = { valid_tokens: [] };
    }
    if (!config.auth.valid_tokens) {
      config.auth.valid_tokens = [];
    }

    // 将新生成的 key 添加到列表中
    config.auth.valid_tokens.push(newKey);

    // 将更新后的配置写回文件
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

    console.log('\n✅ 成功生成并添加了新的 API Key:');
    console.log(`\n    \x1b[32m${newKey}\x1b[0m\n`);
    console.log('📝 此 Key 已经自动写入到 config.json 中的 valid_tokens 列表中。你可以直接将它分发给用户使用了。\n');

  } catch (error) {
    console.error('❌ 处理 config.json 时发生错误:', error);
  }
};

main();

import { ProviderConfig } from './types';

export async function fetchProviderBalance(providerName: string, config: ProviderConfig): Promise<number> {
  let totalBalance = 0;
  
  if (!config.keys || config.keys.length === 0) return 0;

  for (const key of config.keys) {
    if (!key || key.startsWith('XXXX')) continue; // Skip placeholders

    try {
      if (providerName.toLowerCase().includes('deepseek')) {
        const res = await fetch('https://api.deepseek.com/user/balance', {
          headers: { 'Authorization': `Bearer ${key}`, 'Accept': 'application/json' }
        });
        if (res.ok) {
          const data = await res.json();
          const cnyInfo = data.balance_infos?.find((b: any) => b.currency === 'CNY');
          if (cnyInfo && cnyInfo.total_balance) {
            totalBalance += parseFloat(cnyInfo.total_balance);
          }
        }
      } else if (providerName.toLowerCase().includes('kimi')) {
        // 先尝试查询 Kimi For Coding 专属接口
        const codingRes = await fetch('https://api.kimi.com/coding/v1/usages', {
          headers: { 'Authorization': `Bearer ${key}` }
        });
        
        if (codingRes.ok) {
          const data = await codingRes.json();
          // 优先取周额度 remaining，如果没有则取 5小时额度 detail.remaining
          if (data.usage && data.usage.remaining) {
            totalBalance += parseFloat(data.usage.remaining);
          } else if (data.limits && data.limits[0]?.detail?.remaining) {
            totalBalance += parseFloat(data.limits[0].detail.remaining);
          }
        } else {
          // 如果失败，回退到普通的 Moonshot 开放平台查询 (CNY 余额)
          const res = await fetch('https://api.moonshot.cn/v1/users/me/balance', {
            headers: { 'Authorization': `Bearer ${key}` }
          });
          if (res.ok) {
            const data = await res.json();
            if (data.data && data.data.available_balance) {
              totalBalance += parseFloat(data.data.available_balance);
            }
          }
        }
      }
    } catch (err: any) {
      console.error(`[Usage API] Failed to fetch balance for ${providerName}:`, err.message);
    }
  }

  return totalBalance;
}

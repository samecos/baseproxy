import { ProviderConfig } from './types';

export async function fetchProviderBalance(providerName: string, config: ProviderConfig): Promise<{ balance: number, metadata?: any }> {
  let totalBalance = 0;
  let metadata: any = {};
  
  if (!config.keys || config.keys.length === 0) return { balance: 0 };

  for (const key of config.keys) {
    if (!key || key.startsWith('XXXX')) continue; // Skip placeholders

    try {
      if (providerName.toLowerCase().includes('gemini') || config.type === 'gemini') {
        // Mock free tier for Google AI Studio
        metadata = {
          tiers: [
            {
              name: "five_hour",
              limit: 100,
              remaining: 100,
              utilization: 100,
              resets_at: new Date(Date.now() + 5 * 3600000).toISOString()
            },
            {
              name: "weekly_limit",
              limit: 1000,
              remaining: 1000,
              utilization: 100,
              resets_at: null
            }
          ]
        };
        totalBalance = 100;
        break; // No need to loop
      } else if (providerName.toLowerCase().includes('antigravity') || config.type === 'antigravity') {
        // Health check the Antigravity proxy
        const baseUrl = config.base_url?.replace(/\/+$/, '');
        let healthy = false;
        if (baseUrl) {
          try {
            const healthRes = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(3000) });
            healthy = healthRes.ok;
          } catch {
            // not reachable
          }
        }
        if (healthy) {
          metadata = {
            tiers: [{
              name: "subscription",
              limit: -1,
              remaining: 9999,
              utilization: 0,
              resets_at: null,
            }],
          };
          totalBalance = 9999;
        } else {
          totalBalance = 0;
          metadata = { error: 'Antigravity proxy not reachable' };
        }
        break;
      } else if (config.type === 'local') {
        const baseUrl = config.base_url?.replace(/\/+$/, '');
        let healthy = false;
        if (baseUrl) {
          try {
            const healthRes = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(3000) });
            healthy = healthRes.ok;
          } catch {
            // not reachable
          }
        }
        if (healthy) {
          metadata = {
            tiers: [{
              name: "local",
              limit: -1,
              remaining: 9999,
              utilization: 0,
              resets_at: null,
            }],
          };
          totalBalance = 9999;
        } else {
          totalBalance = 0;
          metadata = { error: 'Local model not reachable' };
        }
        break;
      } else if (providerName.toLowerCase().includes('deepseek')) {
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
          
          let shortTermLimit = 0, shortTermRemaining = 0, shortTermResetTime = null;
          let longTermLimit = 0, longTermRemaining = 0;

          if (data.usage) {
            shortTermLimit = parseFloat(data.usage.limit || "0");
            shortTermRemaining = parseFloat(data.usage.remaining || "0");
            shortTermResetTime = data.usage.resetTime;
            // 把短期剩余额度当做主显示数字
            totalBalance = shortTermRemaining; 
          }
          if (data.totalQuota) {
            longTermLimit = parseFloat(data.totalQuota.limit || "0");
            longTermRemaining = parseFloat(data.totalQuota.remaining || "0");
          }

          metadata = {
            tiers: [
              {
                name: "five_hour",
                limit: shortTermLimit,
                remaining: shortTermRemaining,
                utilization: shortTermLimit > 0 ? ((shortTermLimit - shortTermRemaining) / shortTermLimit) * 100 : 0,
                resets_at: shortTermResetTime
              },
              {
                name: "weekly_limit",
                limit: longTermLimit,
                remaining: longTermRemaining,
                utilization: longTermLimit > 0 ? ((longTermLimit - longTermRemaining) / longTermLimit) * 100 : 0,
                resets_at: null
              }
            ]
          };

          // KIMI 是共享账号的套餐，不需要遍历后续的所有 Key
          break;
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

  return { balance: totalBalance, metadata };
}

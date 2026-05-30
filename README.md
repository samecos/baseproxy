# BaseProxy 🚀

BaseProxy 是一个轻量、极速且纯粹的 AI API 代理与聚合服务。
它的核心目标是将分散在各处的 AI 账号、API Key 以及本地大模型（如 Ollama）集中管理，并统一对外暴露出标准的 **Anthropic (Claude) Messages API** 格式接口。

## ✨ 核心特性

- **协议统一**：无论上游是支持 Claude 格式（如 Kimi Code）、还是仅支持 OpenAI 格式（如 DeepSeek, Codex, Ollama），对外统一表现为完美的 Anthropic 协议格式。
- **流式无缝转换**：内置了强大的底层转换器，能够将 OpenAI 格式的 Server-Sent Events (SSE) 流实时拆解并重建为纯正的 Anthropic 事件流。
- **配置驱动与负载均衡**：通过本地纯静态 JSON 文件管理 API Key 池，支持 Round-Robin 自动轮询实现负载均衡。
- **安全管控**：内置自定义 Token 鉴权，仅允许管理员授权的客户端访问。
- **纯粹极致**：采用 Node.js/TypeScript 构建，不依赖臃肿的第三方大模型 SDK，直接使用原生 `fetch` 与 `ReadableStream` 获得最低的延迟。

---

## 📦 快速开始

### 1. 环境依赖

- [Node.js](https://nodejs.org/) (建议 v18+，以支持原生 `fetch`)
- NPM

### 2. 安装与运行

```bash
# 1. 安装依赖包
npm install

# 2. 复制配置模板（根据下文说明配置您的 API Keys）
cp config.example.json config.json

# 3. 启动开发模式（支持热重载）
npm run dev

# 或者，编译并在生产模式下启动
npm run build
npm start
```

_服务默认运行在 `http://localhost:10010`。_

---

## ⚙️ 配置说明 (`config.json`)

系统启动强依赖于根目录下的 `config.json` 文件（注意该文件已加入 `.gitignore` 防止敏感信息泄露）。

配置示例：

```json
{
  "auth": {
    "valid_tokens": [
      "sk-proxy-admin-1", // 客户端访问代理必须在请求头中携带此 Token
      "sk-proxy-admin-2"
    ]
  },
  "models": {
    "kimi-code-model": {
      "type": "anthropic",
      "endpoint": "https://api.moonshot.cn/v1/messages",
      "keys": ["sk-kimi-key-1", "sk-kimi-key-2"],
      "lb_strategy": "round_robin"
    },
    "deepseek-chat": {
      "type": "openai",
      "endpoint": "https://api.deepseek.com/chat/completions",
      "keys": ["sk-deepseek-key"],
      "lb_strategy": "round_robin"
    },
    "ollama-llama3": {
      "type": "openai",
      "endpoint": "http://127.0.0.1:11434/v1/chat/completions",
      "keys": [""],
      "lb_strategy": "round_robin"
    }
  }
}
```

### 参数解释：

- **`auth.valid_tokens`**: 允许访问代理服务的 Token 列表。
- **`models.[模型名称]`**: 您可以在这里自由定义模型别名，外部调用时只需传入这个别名即可。
  - **`type`**: `anthropic`（透传模式） 或 `openai`（自动转换模式）。
  - **`endpoint`**: 上游 API 接口的具体 URL。
  - **`keys`**: API Key 数组。如果配置多个，系统将自动使用 `round_robin`（轮询）策略进行负载均衡调用。

---

## 🛠️ 客户端接入方式

您可以将任何支持配置“自定义 API 端点”的第三方工具（如 Chatbox, Dify, NextChat 等）接入 BaseProxy：

- **提供商 / API 格式**：选择 `Anthropic` / `Claude`
- **API URL (Base URL)**：填写 `http://<您的服务器IP>:10010/v1/messages` (部分客户端只需要填 `http://<您的服务器IP>:10010`)
- **API Key**：填写您在 `config.json` 中配置的 `valid_tokens` (如 `sk-proxy-admin-1`)
- **模型**：填写您在 `models` 下配置的名称（如 `kimi-code-model`, `deepseek-chat`, `ollama-llama3` 等）。

---

## 📄 许可协议

本项目采用 [MIT License](LICENSE) 开源。

# LLM Gateway

统一管理所有 LLM API 的网关平台 — 一个 OpenAI 兼容的 API 网关，支持多供应商路由、用量追踪和智能负载均衡。

## ✨ 功能特性

- **多供应商管理** — 支持 15+ LLM 供应商，包括 OpenAI、Anthropic、DeepSeek、智谱 AI、Groq 等
- **自动获取模型** — 从 `/v1/models` API 自动拉取可用模型，带搜索和勾选功能
- **智能路由** — 按模型名称模式匹配，将请求路由到最优供应商
- **用量追踪** — Token 计数、成本估算、请求延迟等完整用量统计
- **API 连接测试** — 一键测试供应商 API 连通性，批量测试支持
- **代理配置** — 每个供应商可独立配置 SOCKS5/HTTP 代理
- **OpenAI 兼容** — 完全兼容 OpenAI API 格式，现有客户端无需修改
- **API Key 管理** — 生成 `gw_live_sk_*` 格式的网关 API Key，支持多 Key 管理
- **云端同步** — Supabase 驱动，数据自动云端备份和多设备同步

## 🏗️ 技术架构

| 层 | 技术 |
|---|---|
| 前端 | React + TypeScript + shadcn/ui + Tailwind CSS |
| 构建 | Vite |
| 后端 | Cloudflare Pages Functions |
| 数据库 | Supabase (PostgreSQL) |
| 部署 | Cloudflare Pages |

## 📁 项目结构

```
├── functions/              # Cloudflare Pages Functions (后端)
│   ├── api/
│   │   ├── health.js       # 健康检查
│   │   └── test-provider.js # 供应商 API 测试代理 (支持 GET)
│   ├── v1/
│   │   ├── models.js       # /v1/models — 模型列表
│   │   ├── chat/
│   │   │   └── completions.js # /v1/chat/completions — 聊天补全
│   │   └── _lib.js         # 网关核心逻辑 (认证、路由、转发)
│   ├── rest/
│   │   └── index.js        # /rest — API Key 管理 REST API
│   │   └── _lib.js
│   └── _shared/
│   │   └── lib.js          # 共享工具
├── src/                    # 前端 React 应用
│   ├── pages/
│   │   ├── DashboardPage.tsx    # 仪表盘
│   │   ├── LoginPage.tsx        # 登录/注册
│   │   ├── ProvidersPage.tsx    # 供应商管理
│   │   ├── RoutesPage.tsx       # 路由规则
│   │   ├── SettingsPage.tsx     # 系统设置
│   │   └── UsagePage.tsx        # 用量统计
│   ├── lib/
│   │   ├── auth.ts              # Supabase 认证
│   │   ├── gateway-config.ts    # 网关配置
│   │   ├── store.ts             # 数据持久化
│   │   └── supabase.ts          # Supabase 客户端
│   └── components/              # UI 组件 (shadcn/ui)
├── supabase/
│   └── migrations/              # 数据库迁移脚本
├── wrangler.toml               # Cloudflare 配置
└── vite.config.ts              # Vite 构建配置
```

## 🚀 快速开始

### 前置要求

- Node.js 18+
- npm
- Supabase 项目（用于认证和数据存储）
- Cloudflare 账户（用于部署）

### 本地开发

```bash
# 克隆项目
git clone https://github.com/gowfqk/llm-gateway.git
cd llm-gateway

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入你的 Supabase 配置

# 启动开发服务器
npm run dev
```

### 环境变量

| 变量 | 说明 | 示例 |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase 项目 URL | `https://xxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key | `eyJ...` |
| `VITE_DEMO_EMAIL` | 演示账号邮箱（可选） | `admin@llmgateway.com` |
| `VITE_DEMO_PASSWORD` | 演示账号密码（可选） | `demo123456` |

### Cloudflare Secrets（线上部署）

通过 `wrangler pages secret put` 设置，不写入代码：

| Secret | 说明 |
|---|---|
| `SUPABASE_URL` | Supabase 项目 URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `GATEWAY_API_KEYS` | 网关 API Key（逗号分隔） |

### 部署到 Cloudflare Pages

```bash
# 构建
npm run build

# 部署
npx wrangler pages deploy dist --project-name llm-gateway

# 设置 secrets
echo "your-value" | npx wrangler pages secret put SUPABASE_URL --project-name llm-gateway
echo "your-value" | npx wrangler pages secret put SUPABASE_SERVICE_ROLE_KEY --project-name llm-gateway
```

## 🔌 API 使用

网关完全兼容 OpenAI API 格式，只需将 `base_url` 替换为网关地址：

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://api.122048.xyz/v1",
    api_key="gw_live_sk_your-key-here"
)

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello"}]
)
```

### 可用端点

| 端点 | 说明 |
|---|---|
| `GET /v1/models` | 获取所有可用模型列表 |
| `POST /v1/chat/completions` | 聊天补全（OpenAI 兼容） |
| `GET /api/health` | 网关健康检查 |
| `POST /api/test-provider` | 供应商连通性测试 |
| `GET /rest` | API Key 管理 REST API |

## 🔒 安全

- 所有密钥通过 Cloudflare Secrets 管理，**不硬编码在代码中**
- `.env` 和 `.dev.vars` 已在 `.gitignore` 中排除
- 演示账号密码可通过环境变量覆盖
- API Key 使用 `gw_live_sk_` 前缀，便于识别和管理

## 📄 License

MIT
# Cloudflare Pages 部署指南

## 项目结构

```
├── wrangler.toml              # Cloudflare Pages 配置
├── public/
│   └── _routes.json           # Pages Functions 路由规则
├── functions/
│   └── api/
│       └── health.js          # 健康检查
├── src/                       # 前端源码
├── dist/                      # 构建产物（部署到 Cloudflare Pages）
└── .env                       # 环境变量（不提交到 git）
```

## 部署步骤

### 1. 安装 Wrangler CLI

```bash
npm install -g wrangler
```

### 2. 登录 Cloudflare

```bash
wrangler login
```

### 3. 构建前端

```bash
npm run build
```

### 4. 部署到 Cloudflare Pages

```bash
npm run deploy
```

或手动部署：

```bash
wrangler pages deploy dist --project-name=llm-gateway
```

首次部署时 Wrangler 会提示创建项目，按提示操作即可。

## 环境变量配置

在 Cloudflare Pages 控制台配置以下环境变量：

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `VITE_SUPABASE_URL` | Supabase 项目 URL | `https://xxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key | `eyJ...` |

设置路径：Cloudflare Dashboard → Pages → 你的项目 → Settings → Environment variables

## Pages Functions 说明

`functions/` 目录下的文件会被 Cloudflare Pages 自动识别为服务端函数：

- **GET `/api/health`** — 健康检查端点

> 浏览器侧 API 测试如需代理转发，请在“设置 → 代理地址”中填写你自己的代理服务地址。

## 供应商独立代理配置

每个供应商可以在编辑页面配置独立的代理：

- **SOCKS5** — 适用于需要科学上网的 API（OpenAI/Anthropic/Google）
- **HTTP/HTTPS** — 标准 HTTP 代理
- **不启用** — 国内直连（DeepSeek/智谱/百川等）

> ⚠️ 注意：Cloudflare Workers 运行在 Cloudflare 边缘节点，**不支持 SOCKS 代理**。
> 如果需要访问被墙的 LLM API，请使用国内中转服务或在供应商设置中配置 HTTP 代理。

## 验证部署

```bash
# 检查健康状态
curl https://llm-gateway.pages.dev/api/health

# 应该返回:
# {"status":"ok","platform":"cloudflare-pages","timestamp":"..."}
```

## 常见问题

### Q: 浏览器里的 API 测试为什么失败？
A: 当前项目不再内置 `/api/proxy`。如果目标模型接口存在跨域限制，请到设置页填写你自己的代理地址；若未配置，则前端只会尝试公共 CORS 代理作为兜底。

### Q: OpenAI/Anthropic API 连接超时？
A: Cloudflare 边缘节点可能无法直接访问被墙的 API。解决方案：
1. 使用国内镜像/中转服务
2. 在供应商设置中配置 HTTP 代理
3. 使用支持国内访问的供应商（DeepSeek/智谱/百川等）

### Q: 如何查看函数日志？
A: 登录 Cloudflare Dashboard → Pages → 你的项目 → Functions → 查看日志。

### Q: 如何绑定自定义域名？
A: Cloudflare Dashboard → Pages → 你的项目 → Custom domains → Add domain。

## 本地开发

```bash
# 启动前端开发服务器
npm run dev

# 使用 Wrangler 本地模拟 Pages Functions
npx wrangler pages dev dist
```

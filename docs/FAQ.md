# LLM Gateway — 常见问题 (FAQ)

## 目录

- [部署相关](#部署相关)
- [API 使用](#api-使用)
- [供应商配置](#供应商配置)
- [模型别名与路由](#模型别名与路由)
- [API Key 与权限](#api-key-与权限)
- [用量统计](#用量统计)
- [Playground](#playground)
- [数据与同步](#数据与同步)
- [故障排查](#故障排查)

---

## 部署相关

### Q: 部署后访问页面白屏？

**A:** 常见原因：

1. **未配置 Supabase 环境变量** — 检查 Cloudflare Pages 是否设置了 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`（注意：这两个是构建时变量，需要在 Environment Variables 中设置，不是 Secrets）
2. **构建产物为空** — 确认 `npm run build` 能正常产出 `dist/` 目录
3. **路由配置错误** — Cloudflare Pages 默认支持 SPA 路由，无需额外配置

### Q: GitHub Actions 部署失败？

**A:** 检查以下 GitHub Secrets 是否正确配置：

| Secret | 获取方式 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare Dashboard → My Profile → API Tokens → Create Token → 选择 "Edit Cloudflare Workers" 模板 |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Dashboard → 左下角 → Account ID |

常见错误：
- `Authentication error` — Token 无效或权限不足
- `Could not find project` — 需要先在 Cloudflare Pages 手动创建项目（首次部署）

### Q: 如何首次部署（项目还不存在）？

**A:** 第一次需要手动部署一次来创建项目：

```bash
npm run build
npx wrangler pages deploy dist --project-name llm-gateway
```

之后 GitHub Actions 自动部署就能找到项目了。

### Q: 如何绑定自定义域名？

**A:** Cloudflare Dashboard → Pages → 项目 → Custom domains → Add domain。域名的 DNS 需要托管在 Cloudflare 或配置 CNAME 指向 `<project>.pages.dev`。

---

## API 使用

### Q: 如何调用网关 API？

**A:** 完全兼容 OpenAI SDK，只需修改 `base_url`：

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://your-gateway.pages.dev/v1",
    api_key="gw_live_sk_your-key-here"
)

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello"}]
)
```

### Q: 支持哪些 API 端点？

**A:**

| 端点 | 方法 | 说明 |
|---|---|---|
| `/v1/chat/completions` | POST | 聊天补全（流式/非流式） |
| `/v1/models` | GET | 获取可用模型列表 |
| `/api/health` | GET | 健康检查 |
| `/api/config` | GET | 运行时配置 |
| `/api/test-provider` | POST | 供应商连通性测试 |

### Q: 如何使用流式响应？

**A:** 在请求体中设置 `stream: true`：

```python
stream = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello"}],
    stream=True
)
for chunk in stream:
    print(chunk.choices[0].delta.content or "", end="")
```

### Q: 响应中的 `_gateway` 字段是什么？

**A:** 网关在非流式响应中会附加元信息：

```json
{
  "_gateway": {
    "requestId": "req-xxx",
    "provider": "OpenAI",
    "providerId": "openai-1",
    "latency": 1234,
    "attempt": 1,
    "originalModel": "gpt4",
    "resolvedModel": "gpt-4o"
  }
}
```

包含请求 ID、实际使用的供应商、延迟、重试次数、别名解析结果等。

---

## 供应商配置

### Q: 如何添加新的供应商？

**A:** 供应商管理页 → 点击「添加」→ 选择类型 → 填入 Base URL 和 API Key → 手动输入模型或点击「自动获取」。

### Q: 支持哪些供应商类型？

**A:** 内置 18 种：

| 类型 | 供应商 | 格式 |
|---|---|---|
| openai | OpenAI | OpenAI 兼容 |
| anthropic | Anthropic | 自有格式（自动转换） |
| google | Google AI | 自有格式（自动转换） |
| deepseek | DeepSeek | OpenAI 兼容 |
| groq | Groq | OpenAI 兼容 |
| xai | xAI (Grok) | OpenAI 兼容 |
| mistral | Mistral AI | OpenAI 兼容 |
| cohere | Cohere | 自有格式（自动转换） |
| openrouter | OpenRouter | OpenAI 兼容 |
| modelscope | 魔塔社区 | OpenAI 兼容 |
| cloudflare | Cloudflare AI | Workers AI 格式 |
| siliconflow | 硅基流动 | OpenAI 兼容 |
| moonshot | Moonshot (Kimi) | OpenAI 兼容 |
| zhipu | 智谱 AI | OpenAI 兼容 |
| baichuan | 百川智能 | OpenAI 兼容 |
| minimax | MiniMax | OpenAI 兼容 |
| iflytek | 讯飞星辰 | OpenAI 兼容 |
| azure | Azure OpenAI | Azure 格式 |
| custom | 自定义 | 自定义 |

### Q: Cloudflare Workers 无法访问某些供应商（如 Groq）？

**A:** Cloudflare Workers 对同在 Cloudflare 网络上的域名存在同源限制（403 Forbidden）。解决方案：

1. 将供应商的 Base URL 改为中转/镜像地址
2. 使用 HTTP 代理
3. 网关会自动检测并返回明确错误提示

### Q: API 连接测试失败，但 Key 确实有效？

**A:** 可能原因：
- CORS 限制（测试走后端代理绕过）
- 供应商速率限制
- 网络可达性问题（Cloudflare → 供应商网络不通）
- API Key 权限不足（如 Key 绑定了 IP 白名单）

---

## 模型别名与路由

### Q: 模型别名怎么配置？

**A:** 在供应商编辑对话框底部的「模型别名」输入框中配置：

```
gpt4=gpt-4o, claude=claude-sonnet-4-20250514
```

### Q: 如何通过别名指定供应商？

**A:** 使用 `供应商/模型` 格式：

```
fast=groq/llama-3.1-70b-versatile
cheap=deepseek/deepseek-chat
```

供应商标识符支持按 type、id 或 name 匹配（忽略大小写）。

### Q: 路由规则的优先级怎么理解？

**A:** 数字越小优先级越高。请求进来后按优先级从高到低匹配路由规则，匹配到的第一条规则决定目标供应商。

### Q: 模型找不到（404）怎么办？

**A:** 确认：
1. 模型名称正确（区分大小写）
2. 至少有一个启用的供应商包含该模型，或有匹配的路由规则
3. 如果使用别名，确认别名已正确配置

### Q: Fallback 重试机制是怎样的？

**A:** 当请求供应商返回 5xx 或 429 时，网关会自动尝试下一个候选供应商（最多重试 3 次）。4xx 错误（如模型不存在、参数错误）不会触发重试。

---

## API Key 与权限

### Q: 如何创建 API Key？

**A:** 设置页 → 网关 API Key → 点击「新增 API Key」→ 自动生成 `gw_live_sk_*` 格式的 Key → 点击「保存设置」。

### Q: 如何限制某个 Key 只能调用特定模型？

**A:** 设置页 → 展开对应 Key → 「允许调用的模型」输入框中填写：

```
gpt-4o, claude-*, deepseek-chat
```

留空表示无限制。支持通配符 `*`。

### Q: 权限检查返回 403 是什么意思？

**A:** 当前使用的 API Key 不允许调用请求的模型。响应体中会列出该 Key 允许的模型列表：

```json
{
  "error": {
    "message": "Model 'gpt-4o' is not allowed for this API key. Allowed models: deepseek-chat, claude-*"
  }
}
```

### Q: 权限功能不生效（所有模型都能调用）？

**A:** 需要执行数据库迁移添加 `api_key_entries` 列：

```sql
ALTER TABLE gateway_configs
  ADD COLUMN IF NOT EXISTS api_key_entries JSONB NOT NULL DEFAULT '[]'::jsonb;
```

在 Supabase Dashboard → SQL Editor 中执行即可。未执行迁移前，权限功能会优雅降级为无限制。

### Q: 静态 Key（GATEWAY_API_KEYS 环境变量）支持权限配置吗？

**A:** 不支持。通过环境变量 `GATEWAY_API_KEYS` 配置的静态 Key 没有模型限制，只用于简单的认证场景。权限管理仅对 Supabase 中存储的 Key 生效。

---

## 用量统计

### Q: 流式请求的 token 数显示为 0？

**A:** 确保你使用的是最新版本代码。当前版本已支持流式 token 统计：
- OpenAI 兼容供应商：自动注入 `stream_options: { include_usage: true }` 获取 token 数
- Anthropic：从 `message_start` 和 `message_delta` 事件中提取

注意：部分供应商（如某些免费额度的服务）可能不返回 usage 信息。

### Q: 用量数据存储在哪里？

**A:**
- **配置了 Supabase** → 存储在 `usage_records` 表中
- **未配置 Supabase** → 不记录用量日志（仅前端本地有 mock 数据）

### Q: 如何清空用量日志？

**A:** 设置页 → 数据管理 → 点击「清空日志」。这只删除 usage 记录，不影响供应商、路由等配置。

### Q: 成本估算准确吗？

**A:** 网关内置了主流模型的定价表（按官方公布价格），支持精确匹配和前缀匹配。对于未收录的模型，成本显示为 0。定价表会定期更新。

---

## Playground

### Q: Playground 怎么用？

**A:** 侧边栏点击「Playground」→ 在顶部下拉框选择模型 → 输入消息发送。Playground 使用设置中配置的第一个网关 API Key 进行认证。

### Q: Playground 报错 401 Unauthorized？

**A:** 在设置页中确认至少有一个网关 API Key，且已点击「保存设置」。

### Q: Playground 支持会话持久化吗？

**A:** 支持。聊天历史保存在浏览器本地存储（IndexedDB）中，刷新页面不会丢失。切换模型会开启新会话。

### Q: 可以调整 Temperature 等参数吗？

**A:** 可以。Playground 界面右侧（或点击设置图标）可以调节：
- System Prompt
- Temperature (0-2)
- Max Tokens

---

## 数据与同步

### Q: 数据保存在哪里？

**A:**
- **配置了 Supabase** → 所有数据（供应商、路由、API Key、用量）同步到 Supabase PostgreSQL
- **未配置 Supabase** → 所有数据保存在浏览器 IndexedDB 中，换浏览器/设备数据丢失

### Q: 如何启用云端同步？

**A:** 在 `.env` 文件中配置：

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...your-anon-key
```

然后执行 `supabase/migrations/` 目录下的所有 SQL 迁移脚本（在 Supabase Dashboard → SQL Editor 中执行）。

### Q: 如何备份/迁移配置？

**A:** 设置页 → 数据管理 → 「导出配置」会下载一个 JSON 文件，包含所有供应商、路由和网关设置。「导入配置」可以恢复。

### Q: 多设备同步有延迟吗？

**A:** 几乎无延迟。每次加载页面时会从 Supabase 拉取最新数据，保存时实时写入。

---

## 故障排查

### Q: 所有模型都报 500 错误？

**A:** 按顺序排查：

1. **检查 Cloudflare Functions 日志** — Dashboard → Pages → 项目 → Functions → 查看日志
2. **检查 Supabase 配置** — 确认 `SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY` 的 Cloudflare Secrets 正确
3. **检查供应商配置** — 确认至少有一个供应商已启用且 API Key 有效
4. **数据库列不存在** — 如果刚更新代码但未执行新的迁移，可能导致 SQL 查询报错。执行 `supabase/migrations/` 下的最新迁移

### Q: 认证失败（401）但 Key 正确？

**A:** 可能原因：
- Key 前后有空格（复制时常见）
- Key 存储在 Supabase 但 `SUPABASE_SERVICE_ROLE_KEY` 配置错误
- 使用了旧格式 Key 但数据库 `api_keys` 数组中未包含

### Q: 请求超时（408）？

**A:** 默认超时 2 分钟（非流式）/ 5 分钟（流式）。可能原因：
- 供应商响应慢（如高负载时的 OpenAI）
- 网络中间链路不稳定
- 请求的 max_tokens 过大导致生成时间过长

### Q: Fallback 后所有供应商都失败？

**A:** 响应中会包含最后一个错误信息。常见情况：
- 所有供应商的 Key 都过期了
- 请求的模型在所有候选供应商中都不存在
- 网络全部不可达

### Q: 如何查看详细的错误信息？

**A:**
- **Cloudflare 日志** — Dashboard → Pages → Functions → Real-time Logs
- **响应体** — 错误响应的 `error.message` 字段包含详细信息
- **网关元信息** — 成功响应的 `_gateway` 字段包含供应商和延迟信息

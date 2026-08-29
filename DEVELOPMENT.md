# dsh-veryIM 开发文档

> **UI 规范：** 图标（Lucide 24×24 stroke-2）、主题（CSS 变量）、卡片结构（dsh-mm-*）统一遵循
> `/vol1/1000/DeepSeek/DSH-UI-SPEC.md` —— 所有 ideasir 插件必须遵守，禁止硬编码颜色/非标准图标。

## 1. 项目结构

```text
src/index.ts               # Host 半部：Telegram API、渠道管理、会话路由、Web 路由
src/client/index.js         # Client 半部：插件卡片、渠道管理弹窗、智能检测 UI
src/client/index.tsx        # 旧版 Client（未使用，保留参考）
lib/index.js                # Host 构建产物
lib/client.js               # 浏览器 bundle 构建产物
cordis.patch.yml            # DSH bundle 注册 patch
package.json                # npm 与 DSH bundle 元数据
tsdown.config.ts            # 客户端 bundle 配置
CHANGES.md                  # 详细变更记录
```

运行时使用 `lib/index.js` 和 `lib/client.js`。`src/` 是唯一源码，修改源码后必须重新构建。

## 2. 环境要求

- Node.js 20+（当前开发环境使用 Node.js 24）；
- npm；
- DSH 相关依赖包（`@deepseek-ai/dsh-settings`、`@deepseek-ai/schemastery` 等）；
- `undici`（内置 HTTP 客户端，含 ProxyAgent）。

安装依赖：

```bash
npm install
```

## 3. 构建

### 完整构建

```bash
npm run build
```

等价于：

```bash
npm run build:server   # TypeScript 编译 Host 半部
npm run build:client   # tsdown 构建浏览器 bundle
```

### 分步构建

仅修改服务端（`src/index.ts`）时：

```bash
npm run build:server
```

仅修改客户端（`src/client/index.js`）时：

```bash
npm run build:client
```

客户端构建使用 tsdown，输出包装在 `window.__ModuleLoader__.load(...)` 中的 `lib/client.js`。

## 4. 部署

### 开发环境（直接链接）

```bash
# 构建
npm run build

# 将 lib/ 部署到 DSH profile
cp -r lib/* /root/.dsh/profiles/web/node_modules/dsh-veryIM/lib/
```

### 重启 DSH

```bash
# 重启当前 Profile（不要另起 Web 服务）
systemctl restart dsh
# 或手动
kill $(pgrep -f "dsh.*3080")
cd /root/.dsh/profiles/web && npx dsh web --port 3080 --no-open
```

## 5. Host 半部设计

`src/index.ts` 负责：

1. 渠道配置管理（`~/.dsh/veryIM/config.json`）；
2. Telegram Bot API 通信（长轮询获取更新）；
3. 消息路由：Telegram 用户消息 → DSH Session → AI 回复 → Telegram；
4. Web 路由：`/plugins/dsh-veryIM/*`（status/test/save/delete/check）；
5. 三层网络容错（per-channel → 系统代理 → 直连）。

### 核心数据流

```
Telegram 用户消息
  → tgRaw(botToken, '/getUpdates')
  → handleMsg(update)
    → 写入 DSH session（user message）
    → 轮询 AI 回复（session.history / session.list）
    → 实时编辑 Telegram 消息（send 首条 + edit 后续）
```

### 会话映射

`sessions.json` 存储 Telegram chat ID → DSH session ID 的映射，保证每个 Telegram 用户有独立的 DSH 会话。

## 6. Client 半部设计

客户端使用纯 JS（`src/client/index.js`）+ React 组件混合模式：

- **卡片头部**：React 组件（`VeryIMPluginCard`），注册到 `settings.plugin.item` slot
- **渠道列表 + 添加按钮**：通过 `ref` 挂载 DOM（`innerHTML`），避免深嵌套 React
- **弹窗**：纯 DOM（`innerHTML`），与 passpass 密码本弹窗模式一致

### 客户端构建入口

**当前构建入口是 `src/client/index.js`**（非 `.tsx`）。`.tsx` 是旧版（v0.1.1），保留仅供参考。

## 7. Web 路由

| 路由 | 方法 | 功能 |
| --- | --- | --- |
| `/plugins/dsh-veryIM/status` | GET | 获取所有渠道状态 |
| `/plugins/dsh-veryIM/test` | POST | 测试 Bot Token 有效性 |
| `/plugins/dsh-veryIM/save` | POST | 保存渠道配置并连接 |
| `/plugins/dsh-veryIM/delete` | POST | 删除渠道 |
| `/plugins/dsh-veryIM/check` | GET | 智能检测所有渠道健康状态 |

## 8. 发布流程

1. 修改 `src/` 和/或 `package.json`；
2. 更新版本号（`package.json` + `src/client/index.js` 中的 `VERSION` 常量）；
3. 更新 `CHANGES.md`；
4. 运行 `npm run build`；
5. 将 bundle 部署到 DSH Profile；
6. 重启 DSH；
7. 测试 Telegram 消息收发；
8. `git commit` 并 `git push`。

## 9. 已知限制

- 会话映射（`sessions.json`）仅保存本地，不支持多节点同步；
- 长轮询模式下 Bot Token 写在内存和磁盘配置文件中，需确保服务器安全；
- 当前仅支持 Telegram Bot API 渠道，其他 IM 渠道待扩展。

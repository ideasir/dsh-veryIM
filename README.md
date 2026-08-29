# Very IM

> 当前版本 `0829-0.2.1`，适配 DSH `v0.1.1-rc.2`（开发者预览版）。把 Telegram 等即时通讯渠道接入 DeepSeek Harness，让 AI 通过 Telegram 与你实时对话。

## 功能介绍

### 💬 Telegram 接入

- **Bot API 长轮询** — 无需公网服务器，本地运行即可接收 Telegram 消息
- **实时渐进更新** — AI 回复逐字显示，像思考气泡一样实时更新最终回复
- **命令气泡** — 发送 `/hello` 等命令时，命令本身显示为精简气泡，不占对话空间

### 📡 多渠道管理

- **多渠道并行** — 同时接入多个 Telegram Bot，每个渠道独立配置
- **渠道级代理** — 每个渠道可单独设置 HTTP/SOCKS5 代理
- **渠道级工作区** — 每个渠道可指定独立工作区路径
- **三层网络容错** — per-channel 代理 → 系统 HTTPS_PROXY → 直连，逐层降级不丢消息

### 🔍 智能检测

- **连接健康检测** — 一键检测所有渠道的连通性和延迟
- **代理有效性验证** — 验证代理配置是否可达 Telegram API

### 🖼️ 插件设置页

- **卡片式 UI** — 设置页内嵌插件卡片，展开即可管理渠道
- **添加/编辑/删除** — 完整的渠道 CRUD 操作
- **Token 验证** — 保存前可验证 Bot Token 有效性，显示 Bot 信息

## 安装

### 从 GitHub 克隆构建

```bash
git clone https://github.com/ideasir/dsh-veryIM.git
cd dsh-veryIM
npm install
npm run build
```

### 部署到 DSH Web Profile

在 Web Profile 的 `package.json` 中添加本地包依赖：

```json
{
  "dependencies": {
    "dsh-veryIM": "file:/path/to/dsh-veryIM"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "dsh-veryIM"
      ]
    }
  }
}
```

然后安装并重启：

```bash
cd ~/.dsh/profiles/web
npm install
# 重启 DSH Web Profile
```

## 网络配置

### 直连（海外服务器）

无需额外配置，Bot API 可直连。

### 代理（国内服务器）

推荐使用系统环境变量：

```bash
export HTTPS_PROXY=socks5://127.0.0.1:1080
```

也可在渠道配置中单独设置代理：

```
代理服务器：http://127.0.0.1:1080 或 socks5://127.0.0.1:1080
```

### 三层容错机制

1. **per-channel 代理**（渠道配置的代理，失败重试 2 次）
2. **系统代理**（`HTTPS_PROXY` 环境变量，显式 ProxyAgent）
3. **直连**（最后兜底）

## 数据文件

| 文件 | 作用 |
| --- | --- |
| `~/.dsh/veryIM/config.json` | 渠道配置（Bot Token、代理、工作区） |
| `~/.dsh/veryIM/sessions.json` | Telegram 用户 ↔ DSH 会话映射 |

## 开发

详细的环境、构建、测试和发布说明见 [`DEVELOPMENT.md`](./DEVELOPMENT.md)。

## 版本

参见 [CHANGES.md](./CHANGES.md)。

## License

MIT

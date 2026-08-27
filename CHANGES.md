# dsh-veryIM CHANGES.md

## 2026-08-28 — Telegram 消息样式升级为 MarkdownV2 富文本

### 为什么改
主任反馈：DSH 电报插件发的消息格式不好，希望和 Hermes Agent 的 Telegram 插件一样好看。

根因：veryIM 的 send/edit 调 Telegram API 时没带 `parse_mode`，纯文本发出；
Hermes 用的是 Telegram 的 MarkdownV2 富文本（粗体/斜体/代码块/链接/引用都能渲染）。

### 改了什么
- `src/index.ts`：
  1. `send()` / `edit()`（handleMsg 内闭包）加 `parse_mode: 'MarkdownV2'`；
     解析失败（`can't parse entities` 等）自动回退纯文本重发，保证不断联。
  2. 新增 `mdToTelegram()`：标准 Markdown → Telegram MarkdownV2 转换器，
     逻辑移植自 Hermes agent 的 `format_message`（占位符保护机制）：
     - 先保护围栏代码块/内联代码/链接（占位符替换，防转义污染）
     - 标题 `#..######` → 粗体 `*text*`
     - `**bold**` → `*bold*`，`*italic*` → `_italic_`，`~~del~~` → `~del~`
     - `> 引用` 保留 `>` 并转义内容
     - GFM 管道表格 → 加粗表头 + `•` 列表项（`convertTableToBullets`，Telegram 无表格语法）
     - 其余 MarkdownV2 特殊字符 `_*[]()~`#+-=|{}.!\` 全部反斜杠转义
     - 最后逆序恢复占位符
  3. 构建时把 DSH 全局的 `@types/node` 复制进项目 `node_modules/@types/`
     （tsconfig 要求 node/react 类型；react 未装但 server 端不用，报错可忽略）。

### 怎么调用
无需调用，Telegram 渠道的所有回复自动走新渲染。
send/edit 都是 MarkdownV2 优先 → 失败回退纯文本，双保险。

### 怎么验证
1. 在 Telegram 里给 bot 发消息，回复应显示：**粗体**标题、`代码块`底色、链接可点。
2. 发表格类问题（如对比表），应显示为「**表头·表头**」+ `• 项目` 列表，不是一堆竖线。

### 踩坑
- `npm run build:server` 报 TS2688 缺 `@types/node`/`@types/react`：
  项目 node_modules 没装 types。解决：从 DSH 全局 node_modules 复制 `@types/node`，
  react 报错忽略（tsc 仍产出 index.js，`--noEmitOnError false`）。
- MarkdownV2 转义是雷区：漏转义一个字符整条消息被 Telegram 400 拒收。
  所以移植了 Hermes 的"占位符保护 + 逆序恢复"方案，不自己发明。
- 回退逻辑必须同时覆盖 send 和 edit，否则流式更新（editMessageText）中断留白屏。

### 部署
- 源码：/vol1/1000/DeepSeek/dsh-veryIM（备份 dsh-veryIM.backup-20260828）
- 构建：`cd src && npx tsc --noEmitOnError false --outDir ../lib ...`
- 部署：cp lib/index.js → /root/.dsh/profiles/web/node_modules/dsh-veryIM/lib/
- 重启：systemctl restart dsh
- 版本：0.1.0-rc.2（未升版本号，样式实验性质）

## 2026-08-28（第二次）— 工具调用改为 Hermes 风格人类可读短语

### 为什么改
主任反馈：工具调用显示的样式太乱。之前把「⚙️ 工具名 + 完整 JSON 参数」塞进气泡
（如 `⚙️ terminal {"command":"echo ..."}`），一大坨 JSON 很难看。
Hermes 电报插件用的是**动词短语**（"Running df -h"、"Reading config.yaml"），
简洁整齐，主任要求照这个来。

### 改了什么
- `src/index.ts` 新增 `toolLabel()` / `toolPreview()` / `basename()`：
  - `TOOL_VERBS` 动词映射（Running/Reading/Writing/Editing/Searching/Generating...）
  - 按工具类型提取**最关键的单个参数**做预览（terminal→命令首行、read_file→文件名、
    search_files→pattern、web_search→query...），不再显示完整 JSON
  - 特殊处理：terminal/execute_code 取命令首行、截断 80 字；read_file/write_file/patch 取文件名
- 工具气泡生成改用 `'⚙️ ' + toolLabel(name, args)`，一行一个、人类可读

### 验证效果
之前：`⚙️ terminal {"command":"echo \"=== 系统时间 ===\" && date && echo \"\" && ..."}`
现在：`⚙️ Running echo "=== 系统时间 ===..."`（取首行 + 截断）

### 踩坑
- tool/call 事件的 `arguments` 可能是 JSON 字符串也可能是对象，toolPreview 里先 try JSON.parse
- 动词映射要覆盖 DSH 常用工具（terminal/read_file/write_file/patch/search_files）+ veryIM 工具

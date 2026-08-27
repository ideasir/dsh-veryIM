# dsh-veryIM CHANGES.md

## 2026-08-28（第七次）— 修复最终回复丢失 + 超时补发

### 为什么改
主任反馈：对话最后以 ⚙️ 执行命令结尾，后面没有回复内容。
根因：轮询循环退出后没有做最终回复的补发收集。session 完成时 answer 事件可能还没回传，
导致 collectAnswer 没拿到回复就直接结束了。

### 改了什么
- `src/index.ts`：
  1. **补发阶段**：轮询循环退出后，新增 8 次重试（每次 2 秒），确保最终回复不丢失：
     - 每次重新拉取 session.history 检查 collectAnswer
     - session 已结束且 2 次以上没拿到 answer → 放弃
  2. **超时上限提升**：循环从 300 次（7.5 分钟）→ 600 次（15 分钟），
     处理更复杂的多工具调用任务

### 部署
- 构建：`npm run build:server`
- 部署：cp lib/index.js → /root/.dsh/profiles/web/node_modules/dsh-veryIM/lib/
- 重启：systemctl restart dsh

## 2026-08-28（第六次）— 命令气泡单行显示 + 引用逻辑调整

### 为什么改
1. 工具命令气泡有时显示为多行，需要确保始终一行一条
2. 工具命令（⚙️）不应引用用户消息，只有最终回复才引用

### 改了什么
- `src/index.ts`：
  1. `send(t, reply)` 加可选 `reply` 参数（默认 false），只有 `reply=true` 时带 `reply_to_message_id`
  2. 最终回复 `splitMessages(answer)` 的每个 chunk 调用 `send(chunk, true)` 启用引用
  3. 工具命令气泡和其他消息不传 reply，保持无引用
  4. `toolLabel()` 返回值压成单行：去掉换行符 `\n`、合并连续空格

### 验证效果
- `⚙️ 执行命令：ls -la` — 单行显示，不引用用户消息
- `⚙️ 读取文件：config.yaml` — 单行显示，不引用用户消息
- 最终回复 — 引用用户原文

### 部署
- 构建：`npm run build:server`
- 部署：cp lib/index.js → /root/.dsh/profiles/web/node_modules/dsh-veryIM/lib/
- 重启：systemctl restart dsh

## 2026-08-28（第五次）— 简化推理思考显示

### 为什么改
主任反馈：思考气泡显示了完整的推理过程，太长太啰嗦，希望简化显示。

### 改了什么
- `src/index.ts`：
  1. 新增 `summarizeThinking(text, maxLen=150)` 函数：
     - 只取第一个段落（双换行分割）
     - 压缩连续空白为单个空格
     - 超过 150 字符自动截断并加 `…`
  2. 思考气泡（🤔）：完整推理文本改为精简摘要后显示
     - 之前：`🤔 模型的完整推理过程……几千字`
     - 现在：`🤔 取第一个段落的精简摘要，150字以内`
  3. 超时提示（⏳ 处理中…）：也同样用精简摘要作为基础内容

### 验证效果
在 Telegram 里给 bot 发消息，思考气泡只显示一句话摘要，不再刷屏大段推理。
如果需要看完整推理，可到 DSH 的 Web 界面查看。

### 部署
- 构建：`npm run build:server`
- 部署：cp lib/index.js → /root/.dsh/profiles/web/node_modules/dsh-veryIM/lib/
- 重启：systemctl restart dsh

## 2026-08-28（第四次）— 回复消息引用用户原文

### 为什么改
主任反馈：AI 回复的消息希望上方能引用用户发的那条原文，方便在群里看清是对哪条消息的响应。

### 改了什么
- `src/index.ts`：`handleMsg` 内的 `send()` 发送的所有消息（命令回复、思考气泡、
  工具命令气泡、最终回复）都带 `reply_to_message_id: msgId`，引用用户发的那条消息，
  Telegram 会自动在回复消息上方显示被引用消息的发送者和内容预览。
  同时加 `allow_sending_without_reply: true` 保险——若被引用消息因时间久远等找不到，
  不会报错，直接正常发送。

### 验证效果
在 Telegram 里给 bot 发消息后，所有机器人的回复消息上方都会出现被引用的原文小框。

### 部署
- 构建：`npm run build:server`
- 部署：cp lib/index.js → /root/.dsh/profiles/web/node_modules/dsh-veryIM/lib/
- 重启：systemctl restart dsh

## 2026-08-28（第三次）— 命令气泡改为中文显示 + 适配 DSH 实际工具名

### 为什么改
主任反馈：电报聊天界面里，工具调用气泡显示的是英文动词短语
（"Running df -h"、"Reading config.yaml"、"Editing ..."），希望全部改为中文。
同时明确要求：思考、命令、回复三部分分别用**单独的气泡**显示。

### 改了什么
- `src/index.ts`：
  1. `TOOL_VERBS` 全部翻译为中文，并适配 DSH 实际工具名：
     - 核心：`bash/terminal→执行命令`、`read/read_file→读取文件`、
       `write/write_file→写入文件`、`edit/patch→编辑文件`、`glob/search_files→搜索文件`、
       `grep→搜索内容`
     - Web：`web_search→搜索网页`
     - 多媒体：`makemake_image→生成图片`、`makemake_video→生成视频`、`read_image→查看图片`、
       `looklook_see→查看内容`、`process_zip→处理压缩包`
     - 目标/任务：`create_goal→创建目标`、`update_goal→更新目标`、`todo_write→更新任务列表`
     - 子代理/工作流：`subagent→委派子任务`、`workflow→编排工作流`、`ralph→运行 Ralph 循环`、
       `send_message→发送消息`、`interrupt_agent→中断代理`
     - 后台任务：`job_kill→停止任务`、`job_output→读取任务输出`、`job_list→列出任务`
     - 凭据：`credential_exec→执行凭据命令`、`credential_http→调用凭据接口`、
       `list_secrets→查看密钥`、`resolve_secret→查找密钥`
     - 技能/其他：`skill→加载技能`、`ask_user_question→询问用户`、`memory→更新记忆`等
     - 保留旧工具名（read_file/write_file/patch/terminal...）作为兼容回退
  2. `toolLabel()` 连接符由英文 `' for '` / `' '` 改为中文冒号 `'：'`，
     默认动词回退由 `'Using'` 改为 `'使用工具'`，未知工具也显示中文。
  3. `toolPreview()` 参数提取对齐 DSH 实际参数名（`file_path`/`command`/`pattern`/
     `queries`/`objective`/`todos`/`questions`...），并保留旧的 `path`/`file` 等作兼容。
  4. `TOOLS_NO_PREVIEW` 扩充（list_secrets/get_goal/job_list/list_agents/exit_plan_mode）。

### 气泡分离（思考/命令/回复各自独立气泡）保持不变
- **思考**：`🤔` 一条气泡，流式渐进更新（editMessageText）
- **命令**：每个工具调用一条独立 `⚙️` 气泡，按"工具名+参数摘要"去重
- **回复**：最终回答单独一条（或多条）干净消息，无前缀

### 验证效果
之前：`⚙️ Running echo "=== 系统时间 ==="...`
现在：`⚙️ 执行命令：echo "=== 系统时间 ==="...`
之前：`⚙️ Reading config.yaml`
现在：`⚙️ 读取文件：config.yaml`
之前：`⚙️ Editing src/index.ts`
现在：`⚙️ 编辑文件：index.ts`

### 部署
- 源码：/vol1/1000/DeepSeek/dsh-veryIM
- 构建：`npm run build:server`
- 部署：cp lib/index.js → /root/.dsh/profiles/web/node_modules/dsh-veryIM/lib/
- 重启：systemctl restart dsh

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

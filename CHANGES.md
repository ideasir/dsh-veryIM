# dsh-veryIM CHANGES.md

## 2026-08-28（第十一次）— 渠道标签显示工作区路径
### 改了什么
- `src/client/index.js` 渠道标签：原来只显示"工作区"文字，改为显示工作区路径值（📁 + 路径）
- 路径过长时 ellipsis 截断，鼠标悬停（title）显示完整路径
### 部署
- 构建：`npm run build:client`
- 部署：cp lib/client.js → /root/.dsh/profiles/web/node_modules/dsh-veryIM/lib/
- 重启：systemctl restart dsh

## 2026-08-28（第十次）— 修复代理回退丢消息 bug

### 为什么改
测试发现：per-channel socks5 代理瞬时 TLS 掉线时，插件"回退系统代理"用的是**裸 fetch()**，
而本环境 undici 全局 fetch 不读 `HTTPS_PROXY`，直接连 api.telegram.org:443 超时失败。
此时 update 已被 ack（offset 已推进），消息被吞，用户收不到回复。
系统 HTTPS 代理 vpn15.very.im:2888 本身可用，问题只在回退逻辑没用它。

### 改了什么
- `src/index.ts` 的 `tgRaw()`：
  1. **per-channel 代理失败先重试一次**（间隔 1.5s），再做回退
  2. **回退改用显式 `ProxyAgent(process.env.HTTPS_PROXY)`** 构造 dispatcher，
     而不是裸 fetch（新增 `systemDispatcherFor()`，缓存系统代理 dispatcher）
  3. 系统代理也失败时，最后才直连兜底
- 三层容错顺序：per-channel（重试2次）→ 系统代理（显式）→ 直连

### 验证
`HTTPS_PROXY=https://vpn15.very.im:2888` 可用；per-channel 掉线后能正确回退系统代理，
不再吞消息。

### 部署
- 构建：`npm run build:server`
- 部署：cp lib/index.js → /root/.dsh/profiles/web/node_modules/dsh-veryIM/lib/
- 重启：systemctl restart dsh

## 2026-08-28（第九次）— 回复实时渐进更新 + 网络容错

### 为什么改
第八次把回复改成"session 结束后才发送"，但长任务 AI 要跑很久，用户中途只看到命令气泡，
以为没回复。且日志发现 `handleMsg err: fetch failed`——一次 Telegram/RPC 网络失败会中断
整个消息处理，导致后续轮询全停、回复发不出来。

### 改了什么
- `src/index.ts`：
  1. **回复改为实时渐进更新**：像思考气泡一样，AI 每次输出 text 就用一条 💬 消息实时
     更新（send 首条 + edit 后续），用户随时能看到回复内容，最终停在最终回复。
  2. **轮询循环容错**：`session.history` / `session.list` 单次失败不再中断整个 handleMsg，
     记录 warn 后下一轮继续（`console.warn` + `continue`）。
  3. **send 失败重试**：sendMessage 失败自动重试 3 次（每次间隔 2s），不再向上抛异常中断。
  4. 兜底阶段/超时提示同样加 try-catch。

### 验证
真实 telegram 会话最终回复 1128 字，渐进更新方案下用户可实时看到回复增长，
session 结束后停留最终回复。

### 部署
- 构建：`npm run build:server`
- 部署：cp lib/index.js → /root/.dsh/profiles/web/node_modules/dsh-veryIM/lib/
- 重启：systemctl restart dsh

## 2026-08-28（第八次）— 根因修复：最终回复采集逻辑

### 为什么改
第七次的补发方案仍没解决"对话以执行命令结尾、无最终回复"。深入排查真实会话事件流后
找到根因：`collectAnswer` 依赖 `minTurn` 过滤 + 拼接所有 turn 的 text。而一个回合里
AI 会输出**多个** text block（中间内容 + 最终回复）。当轮询第一次检测到 answer 非空时就
`answerSent=true` 发送中间内容；且 `minTurn = 历史最大 turn + 1` 在 turn 编号不连续/重放时
会过滤掉最终回复（模拟验证 `minTurn=13` 时 answer 为空）。

### 改了什么
- `src/index.ts`：
  1. `collectAnswer(events)` **去掉 minTurn 参数和过滤**，改为只返回**最新一条
     assistant/message 的 text**（即最终的回复）。用真实会话数据验证能正确拿到 1128 字的
     最终回复。
  2. `handleMsg` 轮询里改为**持续更新 `latestAnswer`**（不立即发送，避免中间 text 抢先），
     等 session 结束后发送最终回复。
  3. 补发阶段同样用最新逻辑，session 结束后确保最终回复送达。

### 验证
真实 telegram 会话（turn 12，74 步，41 次工具调用）最终回复 1128 字正常提取：
"所有插件功能正常运行！✅ 还需要测试其他方面吗？"

### 部署
- 构建：`npm run build:server`
- 部署：cp lib/index.js → /root/.dsh/profiles/web/node_modules/dsh-veryIM/lib/
- 重启：systemctl restart dsh

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

## 2026-08-28（第三次）— 修复多轮对话消息重复发送（深层 bug）

### 表象
机器人对话框消息重复发送——用户发第 2 条消息时，会把上一轮的回复重复发一遍。

### 根因（深层）
`collectAnswer()` 当初注释说"不按 minTurn 过滤（turn 编号脆弱）"，直接取 history 里
**最新一条** assistant text。但多轮对话时，下一轮 poll 一开始 history 里最新一条
assistant 消息还是**上一轮的回复**，被当成"最新回复"重复发送。
而 `collectThinking()` 一直传 minTurn 所以思考不重复——两边逻辑不一致。

### 修复
1. `collectAnswer(events, minTurn)` 恢复按 turn 过滤：只取本回合（turn >= minTurn）的
   assistant text，不再把历史回合回复当成本轮回复。
2. 两个调用点（主轮询 L318、兜底重试 L336）都传 `minTurn`。
   - 兜底重试尤其关键：之前不传 minTurn，session 结束兜底时会把历史回复补发一遍 = 重复的第二个来源。

### 验证
多轮对话测试：第 2 轮开始时不再重复第 1 轮回复，只显示本轮的新回复。

### 踩坑
- 两处 `collectAnswer` 调用都必须传 minTurn，漏一处都会重复（主轮询 OR 兜底）。
- 之前"不按 turn 过滤"是错误权衡——turn 编号脆弱的代价远小于重复发送。

## 2026-08-28（第四次）— 去掉思考内容显示

### 为什么改
主任反馈：不要显示思考的内容。之前轮询时会发一条「🤔 思考摘要」消息，主任不需要看到推理过程。

### 改了什么
- `src/index.ts` 轮询逻辑：删除思考气泡（collectThinking 的 🤔 消息）。
  现在只显示：工具调用 ⚙️ 气泡 + 最终回复一条。
- `thinkingMsgId`/`shownThinking` 变量删除，改为 `interruptMsgId`（仅保留打断消息的引用）。
- 超时提示改为更新打断消息：`⏳ 处理中…（仍在处理中，发送 /cancel 可打断）`，不再依赖思考。
- `collectThinking`/`summarizeThinking` 函数保留未删（无调用，无害），后续如需恢复可用。

### 现在显示顺序
1. （如有打断）⏸️ 已打断上一条
2. ⚙️ Running xxx（每个工具独立气泡）
3. 最终回复单独一条干净消息

## 2026-08-28（第五次）— 去掉思考内容显示

### 为什么改
主任反馈：不要显示思考的内容。之前轮询时会发一条 `🤔 思考中：...` 消息，主任不需要看这个。

### 改了什么
- 删除思考气泡：不再发送/更新 `🤔 摘要` 消息
- 删除 `thinkingMsgId`/`shownThinking` 变量
- 超时提示改为更新打断消息（`interruptMsgId`），不再依赖思考内容
- `collectThinking` / `summarizeThinking` 函数保留（无害，未来可复用）

### 现在的显示流
用户发消息 → （如有打断消息）→ 每个工具 ⚙️ 独立气泡 → 最终回复单独一条
没有 🤔 消息。

## 2026-08-28（第六次）— 回复气泡底部显示当前模型

### 为什么改
主任需求：回复气泡最下面要有一个固定格式，显示当前 IM 渠道所用的模型。

### 数据来源
DSH 的 `assistant/message` 事件里 `message.source.model` 字段存有当前回复所用的模型名
（如 `aplan`、`deepseek-v4-flash` 等），直接从 history 事件里提取。

### 改了什么
1. 新增 `collectModel(events, minTurn)` 函数：
   遍历本回合的 `assistant/message` 事件，提取 `message.source.model`，
   与 `collectAnswer` 用同样的 `minTurn` 过滤（只看本回合）。
2. 主轮询 + 兜底重试两处回复发送逻辑：回复正文 + footer 拼接。
   footer 格式：`────────\n🤖 ${model}`
3. footer 在 MarkdownV2 下会被转义为 `────────\n🤖 aplan`（不显示分隔线），
   Telegram MarkdownV2 无水平线语法，但 `────────` 字符本身不需要转义（Unicode 横线）。

### 显示效果
```
（AI 回复内容）

────────
🤖 aplan
```

### 踩坑
- `message.source` 只在 `assistant/message` 事件有，`assistant/chunk` 没有——所以只能从最终 message 里取，不能从 streaming chunk 里实时取。
- footer 需要在 edit 时也更新（因为 model 在回复过程中可能不变，但 edit 覆盖时需要整体拼接）。

## 2026-08-28（第七次）— 思考气泡：显示进度 + 回复出现后自动消失

### 为什么改
主任反馈：不显示思考内容的话，卡太久用户看不到进度。但思考内容不需要留存——回复出现后思考气泡应该消失。
需求：思考过程**临时显示**，回复出现后**自动删除**。

### 改了什么
1. **恢复思考气泡显示**（步骤 1）：`collectThinking` + `summarizeThinking` 重新启用，
   轮询时渐进更新一条 `🤔 摘要` 消息，让用户看到当前在做什么。
2. **回复出现后删除思考气泡**（新增 `del` 函数）：
   - `del(messageId)` → 调用 Telegram `deleteMessage` API
   - 主轮询回复出现后：`del(thinkingMsgId)` 立即删除思考气泡
   - 兜底补发回复后：同样删除思考气泡
3. **超时提示保留思考内容**：超时时更新思考气泡为 `🤔 摘要 + ⏳仍在处理中`，
   不删除（因为此时还没有回复，不能删）。
4. 删除后 `thinkingMsgId = null` 防止重复删除。

### 现在的流程
用户发消息 → 🤔 思考中… → ⚙️ Running xxx → ⚙️ Reading xxx → （回复出现）→ 🤔 消息消失
→ 最终回复一条干净消息（底部带 🤖 模型名）

### 踩坑
- Telegram bot 只能删自己发的消息，且 bot 必须在群组有删消息权限。
- `del()` 必须 `.catch(() => {})` 吞错误——聊天场景删消息偶尔 403（消息已不存在）
  不应中断流程。

## 2026-08-28（第八次）— 回复气泡不覆盖：每条 assistant text 独立气泡

### 为什么改
主任反馈：回复内容的气泡会变化内容。第一次出现中间回复（如"好的，我来查看..."），
然后继续执行命令，最后第一条气泡被 edit 覆盖成最终回复——用户看到"气泡内容会变"，
很混乱。主任要求：中间回复和最终回复各自独立气泡，互不覆盖。

### 根因
之前 `collectAnswer` 只取**最新一条** assistant text，然后用 `answerMsgId` 去 edit
覆盖——所有回复都挤在同一条气泡里，中间回复被最终回复覆盖。

### 改了什么
1. `collectAnswer(events)` → `collectAnswers(events)`：返回 `Array<{ turn, text }>`，
   每条 assistant message 独立元素（含中间回复）。
2. 主轮询：遍历 `collectAnswers` 结果，每条用 `send()` 独立气泡（不 edit），
   用 `shownAnswerIds` (Set<number>) 按 turn 去重。
3. 回复出现后仍删除思考气泡（`del(thinkingMsgId)`）。
4. 兜底逻辑：session 结束后只补发**未发送过的**回复（`unsent = answers.filter(a => !shownAnswerIds.has(a.turn))`）。
5. 清理旧变量：`answerMsgId`/`shownAnswer`/`collectAnswer` 全部删除。

### 现在的流程
用户发消息 → 🤔 思考中… → ⚙️ Running xxx → ⚙️ Reading xxx
→ （如有中间回复）好的，我来查看... （独立气泡）
→ （最终回复）最终答案（独立新气泡）+ 🤖 模型名
→ 🤔 消息消失

### 踩坑
- 兜底逻辑引用了已删除的 `collectAnswer`/`shownAnswer`/`answerMsgId` →
  tsc 不报错（`--noEmitOnError false` + TS2688 之前跳过），
  但运行时会 ReferenceError 崩溃。改为 `collectAnswers` + `shownAnswerIds` 后修复。
- 兜底逻辑从"重试 8 次等回复"改为"立即补发未发送回复"——
  因为主轮询已经在 session running 时抓取所有回复，兜底只是处理极少数竞态。

## 2026-08-28（第九次）— 修复最终回复不显示 + 回复去重键升级

### 为什么改
主任反馈两个问题：
1. 执行命令的工具气泡想单行显示（实际已是单行——截图里多行是"每条命令独立气泡"）
2. **最终回复不显示**——执行完所有命令后没有总结回复

### 根因（最终回复不显示）
DSH 的 assistant/message 事件里，**同一个 turn 有多个 step**（step=1 中间回复，
step=2 补充说明，step=3 最终报告）。之前的 `collectAnswers` 用 `turn` 去重，
导致：turn=6 step=1 发出后 shownAnswerIds={6}，step=2 和 step=3 **全被跳过**。
最终回复（step=3）永远发不出来。

### 改了什么
1. `collectAnswers` 返回 `[{ key, text }]`，key = `"turn:step"`（唯一键），
   不再只用 turn。同一个 turn 内不同 step 是不同回复，全部独立发送。
2. `shownAnswerIds` 从 `Set<number>` 改为 `Set<string>`（存 key）。
3. 主轮询 + 兜底逻辑同步改为用 `a.key` 去重。
4. 工具气泡：确认 `toolLabel` 已有 `.replace(/\n/g,' ').replace(/\s+/g,' ')` 压单行，
   命令本身不换行；多条命令是独立气泡，属正常设计。

### 现在的行为
- 中间回复（"好的，我来查看..."）→ 独立气泡
- 补充说明（"我再深入看看..."）→ 独立气泡
- 最终回复（"系统盘占用分析完成！..."）→ 独立气泡 ← 之前被吞了，现在正常
- 每条都带 🤖 模型名 footer

### 踩坑
- DSH 事件模型：turn 是"对话回合"，step 是"回合内的执行步骤"。
  一个 turn 里可能有多条 assistant/message（step 递增），
  去重必须用 turn+step 组合，不能只用 turn。

## 2026-08-29 — WebUI 工作区显示开关

### 需求（主任）
1. 插件设置里加开关：控制 WebUI 显示渠道工作区（全局）
2. 渠道编辑里加开关：单个渠道是否在 WebUI 显示工作区

### 改了什么
**服务端 src/index.ts：**
- VeryIMConfig 加 showWorkspaceInWebui（默认 true）
- /status 返回 settings.showWorkspaceInWebui + 渠道 showInWebui
- /save 支持 showInWebui（默认 true）
- 新增 /webui-settings 保存插件级开关

**客户端 src/client/index.js（实际入口，非 index.tsx）：**
- 卡片展开区加"在 WebUI 显示渠道工作区"插件级开关（调 /webui-settings）
- 编辑弹窗加"在 WebUI 显示工作区"渠道级开关（doSave 传 showInWebui）
- openModal 读取 showInWebui；toggle-ch-ws 切换

### 踩坑（重要）
- **veryIM 客户端真实入口是 src/client/index.js（纯 JS），不是 index.tsx！**
  tsdown.config.ts 的 entry 配的是 index.js。之前改了 index.tsx 构建产物根本没变化，
  白白浪费时间。以后改 veryIM 客户端必须先确认入口文件。

## 2026-08-29 — WebUI 工作区显示开关（修复版）

### 问题
之前开关只做了一半：关闭时删工作区，但开启时不恢复 → 开关开了工作区也不显示。
主任反馈"开了不显示，关了还显示"。

### 修复（双向逻辑）
webui-settings 路由：
- 开启 → workspace.create({path}) 重新注册渠道工作区（显示）
- 关闭 → workspace.delete 移除注册（隐藏）
- 会话数据始终保留在磁盘（workspace.delete 只删注册不删数据）

### 验证（浏览器实测）
- 开 → 侧边栏 telegram + DSH
- 关 → 侧边栏只有 DSH

## 2026-08-29 — 最终版：渠道级工作区显示开关（默认隐藏）

### 需求（主任）
1. 删掉插件设置里的总开关，"在 WebUI 显示渠道工作区"只在编辑渠道页面里设置
2. 默认不在侧边栏显示渠道工作区（标题+对话全隐藏）
3. 渠道级开关控制：打开才显示，关闭整个工作区段（含所有对话）一起隐藏

### 改了什么
**服务端 src/index.ts：**
- save 路由的 showInWebui 默认值从 true 改为 false（新增渠道默认隐藏）
- createSessionLocked 用渠道配置的 workspace 路径建会话（电报对话 → 电报工作区）
- handleMsg 中自动把会话挂进渠道工作区（insertSessionBefore），避免出现"未分组"

**客户端 src/client/index.js（实际入口）：**
- 删除插件设置里的总开关 UI 和事件绑定
- 编辑渠道弹窗保留"在 WebUI 显示工作区"开关（渠道级）
- hideChannelWorkspaces 只读渠道级 showInWebui，不再读插件级 _showWs
- 隐藏逻辑改为向上找到 groupSection（整个工作区段容器，含标题+所有会话）一起隐藏
- 切换开关后刷新渠道配置再应用隐藏

### 验证（浏览器实测）
- 默认关闭（showInWebui=false）→ telegram 标题不可见 + 所有会话不可见 ✅
- 编辑渠道打开开关 → telegram 标题+5条对话恢复显示 ✅
- 关闭 → 整个 telegram 工作区段（标题+对话）全部消失，无残留 ✅
- 渠道健康、工作区数据正常 ✅

## 2026-08-29 — P0 安全修复①：用户白名单（allowlist）

### 为什么
审查发现 P0 安全风险：任何人私聊 bot 就能获得完整 DSH agent 会话（可执行 bash、读写文件、访问凭据），等于把主机能力开放给互联网。

### 改了什么
**服务端 src/index.ts：**
- save 路由渠道对象新增 `allowlist` 字段（数字数组，默认 []）
- 消息轮询处加白名单判定：allowlist 非空时只处理名单内 user id，其他**静默忽略**（不回复不暴露）
- 边界防护：from.id 缺失也拒绝（防恶意构造无 from 消息绕过）

**客户端 src/client/index.js：**
- 编辑渠道弹窗新增「用户白名单」输入框（逗号分隔数字 user id）
- 保存时解析为数字数组提交
- openModal/goBack/弹窗栈同步 _wl 状态

### 验证
- 逻辑测试 6 用例全过（空名单不限/名单内可用/名单外拒绝/无 id 拒绝）
- tsc + tsdown 编译通过
- 部署后 DSH 正常，渠道健康

## 2026-08-29 — P0 安全修复②：Token 脱敏 + CORS 收紧

### 为什么
审查发现：/status 明文回传 botToken + 所有路由 CORS `*` + 无鉴权——恶意网页可读走 token。

### 改了什么
**服务端 src/index.ts：**
- 新增 maskToken()：token 只留前5后3（`86484...UeQ`）
- 新增 isSameOrigin()：判断请求来源
- json() 收紧 CORS：有 Origin 头时只对同源回显；跨源无 CORS 头（浏览器拦截）；无 Origin（非浏览器）回显 *
- /status、/save 路由 botToken 全部脱敏
- 所有路由 json() 传 req 以支持同源判断

**客户端 src/client/index.js：**
- 编辑已有渠道时 token 不回填（服务端只回脱敏值，回填会误保存）
- 显示「✓ 已配置」标识 + 占位符「已配置（留空保持不变）」
- doTest 已配置渠道留空时提示无需重测
- 输入新 token 才提交更换

### 验证
- status 返回 `86484...UeQ`（脱敏）
- 同源 Origin 回显；跨源 evil.com 无 CORS 头
- check 路由正常、渠道健康

## 2026-08-29 — P1 命令菜单（setMyCommands）

### 为什么
审查发现 bot 连上后没注册命令菜单，用户看不到 /help /new /cancel。

### 改了什么
- startPoll 启动长轮询前调用 setMyCommands 注册菜单（/menu 查看命令 /new 新对话 /cancel 取消）
- fire-and-forget：注册失败不影响轮询

### 验证
- Telegram getMyCommands 返回 ['menu', 'new', 'cancel'] ✅
- 渠道正常启动，无错误日志

## 2026-08-29 — P1 媒体下行（agent 出图 → 发回 Telegram）

### 为什么
审查发现体验最大的洞：agent 调用 makemake_image 生成的图片根本到不了用户手上（只能发文字描述）。

### 方案
1. 事件流里 assistant/message 或 tool/result 的 content blocks 中提取 type=image 的 attachment
2. 通过 DSH 附件桥路由 `http://127.0.0.1:3080/plugins/dsh-makemake/image?attachmentId=` 读取真实图片字节（makemake 的 readImage 能读任意 DSH content-addressed attachment）
3. 用 sendPhoto + multipart/form-data 发给用户（走 per-channel → 系统 → 直连三层代理容错）

### 改了什么（src/index.ts）
- 新增 collectMedia()：从事件流提取图片附件（去重）
- 新增 sendPhoto()：读 attachment → multipart sendPhoto，三层代理容错
- 轮询循环新增第 4 步：媒体下行（按 attachmentId 去重，防重复发）

### 验证
- 真实 attachment（sha256:... 1024×1024 JPEG 124KB）读取成功
- sendPhoto 全链路测试成功，图片已发到 Telegram（msg_id=1503）
- 编译通过、渠道正常

## 2026-08-29 — P1 媒体上行（用户发图/文件 → agent 能看）

### 为什么
审查发现用户发图/文件/语音被直接丢弃（!msg.text 就 continue），agent 看不到用户上传的任何媒体。

### 方案
```
用户 Telegram 发图/文件
  → veryIM 检测 photo/document/voice/video/audio
  → getFile 获取 file_path → 下载字节
  → 写入会话 cwd/.uploads/<唯一文件名>
  → session.prompt 注入 "[f:文件名] 用户上传了文件..."
  → agent 调 looklook_see("文件名") → 从 .uploads/ 读到 → 描述
  → veryIM 轮询把回复发回 Telegram
```

### 改了什么（src/index.ts）
- 轮询入口：媒体消息不再丢弃，改走 handleMediaMsg
- 新增 tgDownloadFile()：getFile → 下载 Telegram 文件字节
- 新增 handleMediaMsg()：提取媒体→下载→存 .uploads/→注入 prompt→轮询回复
- 新增 sendPhotoModule()：把 sendPhoto 提为模块级，供 handleMsg/handleMediaMsg 共用
- basename 加入 import（ESM 不用 require）

### 验证
- 编译通过、渠道正常
- 文件路径与 looklook_see 的 .uploads/ 解析一致（exec.agent.session.header.cwd）

## 2026-08-29 — 全自动放行（审批自动允许 + 沙箱全放开）

### 背景
主任要求"全自动放行"。DSH 的 danger-full-access 预设 = 沙箱全放开 + approval never（never=直接拒绝，不是放行）。所以要：沙箱保持 full access + 审批改 ask + 自动应答者放行。

### 改了什么（src/index.ts）
1. 审批自动应答者：ctx.on('approval/request', → allowed-once, prepend=true)
   - prepend 抢在 DSH WebUI 应答者之前，所有审批自动允许不弹窗
2. 会话创建钩子：ctx.on('session/created', setApprovalPolicy(session,'ask'))
   - 覆盖预设的 never 为 ask（never 会跳过应答者直接拒绝）
   - 沙箱保持 danger-full-access（文件全放开）
3. 新增依赖 @deepseek-ai/dsh-user-approval（软链 DSH 全局，同源）

### 验证
- 新会话权限序列：preset=danger-full-access + sandbox=danger-full-access + approval=ask ✅
- 两个钩子注册成功（日志确认）
- 链路：沙箱放开 + 审批 ask → veryIM 自动应答 allowed-once → 全自动放行

## 2026-08-29 — 死代码清理 + 版本号统一

### 死代码清理
- 删除 `src/client/index.tsx`（git rm，旧版 TS 客户端，从未使用）
- 删除 `src/client/index.tsx.bak-1833`、`src/client/index.tsx.old-204912`（本地遗留备份）
- 删除 `src.bak-192209/`（整目录旧备份）
- 客户端现在唯一源码 = `src/client/index.js`（纯 JS，tsdown 入口）
- DEVELOPMENT.md 已更新：标注唯一源码、记录清理说明

### 版本号统一
- 之前：package.json=0829-0.2.1、index.js=0828-0.2.0、index.tsx=0828-0.1.1、README=0829-0.2.1（三处不一致）
- 现在全部统一为 `0829-0.2.1`，无 0828 残留

### 验证
- 构建产物只有 0829-0.2.1
- src/ 无 0828 残留
- DSH 重启正常，插件加载正常

## 2026-08-29 — 复审修复（安全加固 + 7 个 bug）

### 安全加固（不改代码）
1. **启用白名单**：config.json 的 allowlist 设为 [8734867823]（主任 Telegram id）——之前为空，任何能私聊 bot 的人都可拿完整 agent 会话
2. **chmod 600** 数据文件：config.json / sessions.json（botToken 明文不再同机任意用户可读）

### 功能 bug
3. **客户端空语句/死变量**：删掉 `_showWs`（读了插件级设置但从未消费），refreshChannels 只拉渠道列表
4. **媒体上行丢 caption**：用户发「图片+文字」时 promptText 现在带上附言，agent 能看到提问
5. **sticker/animation(GIF) 静默丢弃**：hasMedia 判断 + 媒体提取补 sticker/animation 分支
6. **tgDownloadFile 代理降级不全**：补成三层降级（per-channel → 系统 → 直连），代理抖动不丢文件
7. **媒体下行失败不重试**：shownMedia.add() 移到 sendPhoto 成功后（之前失败也记已发，图永久丢失）
8. **dsh() 硬编码 3080**：改为 DSH_BASE（VERYIM_DSH_PORT 环境变量可覆盖），图片读取路由同步用 DSH_BASE
9. **persistOffset 全量写盘节流**：内存立即更新 + 5 秒防抖落盘，高频消息不每条约写 config.json
10. **edit 无效请求**：thinkingMsgId 为空时跳过，不再发 message_id=0 的无效请求

### 验证
- 服务端 + 客户端编译通过
- DSH 重启正常，渠道健康
- 各修复在产物中确认

## 2026-08-29 — 主任复审修复（Map 清扫 + 轮询延长 + 工作区 attach + 调用修正）

### 主任改动（src/index.ts）
1. **chatGens 加时间戳**：值从 number 改为 {gen, t}，轮询结束后按代次清理（防 Map 只增不减）
2. **recentMsgs 定期清扫**：新增 sweepMaps()，5 分钟一次，70 秒超窗条目清理（防内存增长）
3. **轮询上限 600→2400**：15 分钟→60 分钟，长任务不截断气泡流（处理审查 #9）
4. **handleMediaMsg 调 sendPhotoModule**：直接调模块级函数（修正闭包混乱）
5. **createSessionLocked 解析 workspaceId**：会话创建时先 workspace.list 解析渠道工作区 id 随请求传入，DSH 创建即 attach 进渠道工作区（避免"未分组"）

### 验证
- 服务端 + 客户端编译通过
- 无死代码、无 TODO/FIXME、版本号 0829-0.2.1 一致
- DSH 重启正常、渠道健康
- 产物确认 sweepMaps/2400/workspaceId 已部署

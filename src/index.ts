/** dsh-veryIM 服务端 v5 — 系统代理 + 渠道级工作区 + 智能检测 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { ProxyAgent, fetch as proxyFetch } from 'undici'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import Schema from '@deepseek-ai/schemastery'

const DATA = join(process.env.HOME || '/root', '.dsh', 'veryIM')
const CFG_FILE = join(DATA, 'config.json')
const SES_FILE = join(DATA, 'sessions.json')

const loadCfg = (): any => { try { return JSON.parse(readFileSync(CFG_FILE, 'utf-8')) } catch { return { channels: [] } } }
const saveCfg = (d: any) => { mkdirSync(DATA, { recursive: true }); writeFileSync(CFG_FILE, JSON.stringify(d, null, 2)) }
const loadSes = (): Record<string, string> => { try { return JSON.parse(readFileSync(SES_FILE, 'utf-8')) } catch { return {} } }
const saveSes = (d: any) => { mkdirSync(DATA, { recursive: true }); writeFileSync(SES_FILE, JSON.stringify(d, null, 2)) }
// 会话映射写入：先读磁盘最新值再改，避免多渠道互相覆盖
const updateSes = (mutate: (ses: Record<string, string>) => void) => { const s = loadSes(); mutate(s); saveSes(s) }
const getSes = (key: string): string | undefined => loadSes()[key]

// ── Telegram API（默认走系统 HTTPS_PROXY；ch.proxy 可设为 per-channel 覆盖） ─────────
const TG = 'https://api.telegram.org'

const dispatchers = new Map<string, ProxyAgent>()
function dispatcherFor(ch: any): ProxyAgent | undefined {
  if (!ch?.proxy) return undefined
  const cached = dispatchers.get(ch.id)
  if (cached) return cached
  try {
    const d = new ProxyAgent(ch.proxy)
    dispatchers.set(ch.id, d)
    return d
  } catch (e: any) {
    console.warn(`[dsh-veryIM] ${ch.name} 代理不受支持(${ch.proxy})，回退系统代理: ${e.message}`)
    return undefined
  }
}
async function tgRaw(token: string, path: string, opts: any = {}, dispatcher?: ProxyAgent) {
  const url = `${TG}/bot${token}${path}`
  // 有 per-channel 代理 → 用 undici 自带 fetch + dispatcher（全局 fetch 配 dispatcher 在本 Node 版本不可用）
  if (dispatcher) {
    try {
      return await proxyFetch(url, { ...opts, dispatcher }).then(r => r.json())
    } catch (e: any) {
      console.warn(`[dsh-veryIM] per-channel 代理请求失败(${e.cause?.message || e.message})，回退系统代理`)
      // 失败时回退：全局 fetch 走系统 HTTPS_PROXY，保证不断联
    }
  }
  return fetch(url, opts).then(r => r.json())
}
async function tg(ch: any, path: string, opts: any = {}) {
  return tgRaw(ch.botToken, path, opts, dispatcherFor(ch))
}

// ── DSH RPC（直连 localhost，NO_PROXY 保护） ─────────────
async function dsh(method: string, payload: any) {
  const r = await fetch(`http://127.0.0.1:3080/api/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: `vi-${Date.now()}-${Math.random().toString(36).slice(2,6)}`, method, payload }),
  })
  return r.json()
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// ── 长轮询 ─────────────────────────────────────────────
const polls = new Map<string, AbortController>()
// 同一 chat 并发消息时，会话创建去重，避免双开会话
const sessionLocks = new Map<string, Promise<string>>()
// 每个 chat 的"代次"：新消息到达 +1，让旧回复轮询立即停止（防重复/支持打断）
const chatGens = new Map<string, number>()
// 消息去重：避免同一 update 被重放导致重复处理
const recentMsgs = new Map<string, { id: number; t: number }>()

const HELP_TEXT = [
  '🤖 VeryIM 命令',
  '/help 或 /menu — 显示本菜单',
  '/new — 开启新对话',
  '/cancel — 打断当前回复',
  '————————————',
  '直接发消息给我即可。若我正在处理上一条，会先打断并立即处理你的新消息；回复会实时展示思考、命令和执行过程。'
].join('\n')

function startPoll(ch: any) {
  if (polls.has(ch.id)) return
  const ctrl = new AbortController()
  polls.set(ch.id, ctrl)
  pollLoop(ch, ctrl.signal).catch(e => console.error(`[dsh-veryIM] poll ${ch.name} fatal:`, e.message))
}
function stopPoll(id: string) { const c = polls.get(id); if (c) { c.abort(); polls.delete(id) } }

async function pollLoop(ch: any, signal: AbortSignal) {
  const log = (m: string) => console.log(`[dsh-veryIM] ${ch.name}: ${m}`)
  // 断点续传：从上次 ack 的 update_id+1 开始，避免重启后重放旧消息
  let offset = Number(ch.lastUpdateId) || 0
  log(`长轮询启动 (offset=${offset})`)

  while (!signal.aborted) {
    try {
      const resp = await tg(ch, `/getUpdates?offset=${offset}&timeout=25`)
      if (!resp.ok) { log(`getUpdates: ${resp.description}`); await sleep(10000); continue }
      for (const upd of resp.result || []) {
        offset = Number(upd.update_id) + 1
        if (offset > (Number(ch.lastUpdateId) || 0)) { ch.lastUpdateId = offset; persistOffset(ch) }
        const msg = upd.message
        if (!msg?.text || msg.from?.is_bot) continue
        handleMsg(ch, msg).catch(e => log(`handleMsg err: ${e.message}`))
      }
    } catch (e: any) {
      if (signal.aborted) break
      log(`poll err: ${e.message}`)
      await sleep(5000)
    }
  }
}

function persistOffset(ch: any) {
  const cfg = loadCfg()
  const ex = cfg.channels.find((c: any) => c.id === ch.id)
  if (ex) { ex.lastUpdateId = ch.lastUpdateId; saveCfg(cfg) }
}

async function handleMsg(ch: any, msg: any) {
  const chatId = msg.chat.id
  const text = msg.text.trim()
  const key = `${ch.id}:${chatId}`
  const msgId = msg.message_id

  // 同一消息去重：防止 update 重放造成重复处理
  const prev = recentMsgs.get(key)
  if (prev && prev.id === msgId && Date.now() - prev.t < 60000) return
  recentMsgs.set(key, { id: msgId, t: Date.now() })

  // 代次令牌：本消息使任何更早的同 chat 回复轮询立即失效
  const myGen = (chatGens.get(key) || 0) + 1
  chatGens.set(key, myGen)

  const send = async (t: string) => {
    const md = mdToTelegram(t)
    let resp: any = await tg(ch, '/sendMessage', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: md, parse_mode: 'MarkdownV2' }),
    })
    // MarkdownV2 解析失败（未闭合代码块/残留特殊字符）→ 回退纯文本
    if (!resp?.ok && /parse|entity|UTF|invalid/i.test(resp?.description || '')) {
      resp = await tg(ch, '/sendMessage', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: t }),
      })
    }
    return resp
  }
  const edit = async (messageId: number, t: string) => {
    const md = mdToTelegram(t)
    let resp: any = await tg(ch, '/editMessageText', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId, text: md, parse_mode: 'MarkdownV2' }),
    }).catch(() => null)
    if (resp?.ok || /not modified/i.test(resp?.description || '')) return resp
    // 解析失败 → 回退纯文本再编辑一次
    return tg(ch, '/editMessageText', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId, text: t }),
    }).catch(() => null)
  }
  const typing = () => tg(ch, '/sendChatAction', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, action: 'typing' }),
  }).catch(() => {})

  // 命令菜单
  if (text === '/menu' || text === '/help' || text === '/commands' || text === '/list') { await send(HELP_TEXT); return }

  if (text === '/new') {
    const sid = await createSessionLocked(key, ch)
    if (sid) { updateSes(s => { s[key] = sid }); await send('✅ 新对话已创建。发送 /menu 查看命令') }
    else await send('❌ 无法创建对话会话')
    return
  }

  if (text === '/cancel') {
    const sid = getSes(key)
    if (!sid) { await send('ℹ️ 暂无进行中的对话'); return }
    await dsh('session.cancel', { sessionId: sid }).catch(() => {})
    await send('⏹️ 已取消当前回复')
    return
  }

  await typing()

  let sid = getSes(key)
  if (!sid) {
    sid = await createSessionLocked(key, ch)
    if (sid) updateSes(s => { s[key] = sid })
  }
  if (!sid) { await send('❌ 无法创建对话会话'); return }

  // 打断正在进行的回合：新消息到达则 cancel 当前回合，立即处理新消息
  let sentId: number | null = null
  const items0 = await dsh('session.list', {}).then(r => r?.result?.value?.items || [])
  if (items0.find((s: any) => s.sessionId === sid)?.running) {
    await dsh('session.cancel', { sessionId: sid }).catch(() => {})
    const sent = await send('⏸️ 已打断上一条，正在处理你的新消息…')
    if (sent?.ok) sentId = sent.result.message_id
  }

  // 记录本次消息对应的回合起点：只渲染本回合及之后的事件，避免把历史上下文思考都带上
  let minTurn = 0
  {
    const h0 = await dsh('session.history', { sessionId: sid })
    for (const ev of (h0?.result?.value?.events || [])) {
      const t = ev?.event?.data?.turn
      if (typeof t === 'number' && t > minTurn) minTurn = t
    }
    minTurn += 1
  }

  const promptResp = await dsh('session.prompt', { sessionId: sid, mode: 'queue', content: [{ type: 'text', text }] })
  if (!promptResp?.result?.ok) {
    const m = promptResp?.result?.error?.message || '发送失败'
    if (sentId) await edit(sentId, `❌ ${m}`)
    else await send(`❌ ${m}`)
    return
  }

  // ── 轮询：思考一条、每条命令独立气泡、最终回复单独一条 ──
  // 思考/工具调用：渐进更新一条消息
  let thinkingMsgId: number | null = sentId  // 打断消息或思考消息的 id
  let shownThinking = ''
  // 已发出气泡的工具调用（按"工具名+参数摘要"去重，避免重复发同一条）
  const shownTools = new Set<string>()
  // 是否已发出最终回复
  let answerSent = false
  // 工具结果独立气泡（可选显示）
  const shownResults = new Map<string, string>()

  for (let i = 0; i < 300; i++) {
    if (chatGens.get(key) !== myGen) break   // 已被更新的消息取代 → 立即停止
    await sleep(1500)
    if (i % 2 === 0) await typing()
    const msgs = await dsh('session.history', { sessionId: sid })
    const events = (msgs?.result?.value?.events || [])

    // 1) 思考 → 渐进填充一条 🤔 消息（不显示"思考："前缀，纯内容）
    const thinking = collectThinking(events, minTurn)
    if (thinking && thinking !== shownThinking) {
      shownThinking = thinking
      const text = '🤔 ' + thinking
      if (thinkingMsgId) await edit(thinkingMsgId, text)
      else { const s = await send(text); if (s?.ok) thinkingMsgId = s.result.message_id }
    }

    // 2) 每个工具调用 → 独立 ⚙️ 气泡（Hermes 风格的人类可读短语，不显示原始 JSON）
    const toolCalls = new Set<string>()
    for (const ev of events) {
      const e = ev?.event
      if (!e) continue
      const d = e.data || {}
      if (minTurn > 0 && typeof d.turn === 'number' && d.turn < minTurn) continue
      if (e.type === 'tool/call') {
        const name = d.name || ''
        const args = d.arguments || ''
        const sig = `${name} ${args}`.trim()
        toolCalls.add(sig)
        if (!shownTools.has(sig)) {
          shownTools.add(sig)
          // 单条命令气泡：⚙️ 动词短语（Hermes 风格）
          const bubble = '⚙️ ' + toolLabel(name, args)
          await send(bubble)
        }
      }
    }

    // 3) 最终回复 → 单独一条干净消息（无前缀、无副作用）
    const answer = collectAnswer(events, minTurn)
    if (answer && !answerSent) {
      answerSent = true
      for (const chunk of splitMessages(answer)) await send(chunk)
    }

    const items = await dsh('session.list', {}).then(r => r?.result?.value?.items || [])
    if (!items.find((s: any) => s.sessionId === sid)?.running) break
  }

  // 超时仍在处理 → 更新时间消息上的提示
  const items = await dsh('session.list', {}).then(r => r?.result?.value?.items || [])
  if (chatGens.get(key) === myGen && items.find((s: any) => s.sessionId === sid)?.running) {
    const base = shownThinking || ''
    await edit(thinkingMsgId || 0, cap((base ? base : '⏳ 处理中…') + '\n\n（仍在处理中，发送 /cancel 可打断）', MAX_MSG)).catch(() => {})
  }
}

// 创建会话：同 chat 并发去重；渠道配置了 workspace 时用其作为会话 cwd
function createSessionLocked(key: string, ch: any): Promise<string> {
  const existing = sessionLocks.get(key)
  if (existing) return existing
  const payload = ch?.workspace ? { cwd: ch.workspace } : {}
  const p = dsh('session.create', payload).then(r => r?.result?.value?.sessionId as string).finally(() => sessionLocks.delete(key))
  sessionLocks.set(key, p)
  return p
}

const MAX_MSG = 4000
function cap(s: string, n = 1000): string {
  if (s.length <= n) return s
  return s.slice(0, n) + '…'
}

// ── Markdown → Telegram MarkdownV2 ─────────────────────────
// 移植自 Hermes agent 的 format_message 逻辑：先保护代码块/内联代码，
// 再转换 标题/粗体/斜体/链接/删除线/引用，最后转义剩余特殊字符。
const MDV2_ESCAPE = /([_*[\]()~`>#+\-=|{}.!\\])/g
function escapeMdv2(text: string): string {
  return text.replace(MDV2_ESCAPE, '\\$1')
}
// 表格（GFM pipe table）→ 加粗表头 + 列表项，Telegram 无表格语法
function convertTableToBullets(text: string): string {
  if (!text.includes('|') || !text.includes('-')) return text
  const lines = text.split('\n')
  const out: string[] = []
  let inFence = false
  let i = 0
  const isSep = (l: string) => /^\s*\|?[\s:|-]+\|?\s*$/.test(l) && /-/.test(l)
  const isRow = (l: string) => l.includes('|')
  while (i < lines.length) {
    const line = lines[i]
    const stripped = line.trimStart()
    if (stripped.startsWith('```')) { inFence = !inFence; out.push(line); i++; continue }
    if (inFence) { out.push(line); i++; continue }
    if (isRow(line) && i + 1 < lines.length && isSep(lines[i + 1])) {
      const headerCells = line.split('|').filter((c, idx, arr) => !(idx === 0 && !c.trim()) && !(idx === arr.length - 1 && !c.trim())).map(c => c.trim())
      const rows: string[][] = []
      let j = i + 2
      while (j < lines.length && isRow(lines[j])) {
        rows.push(lines[j].split('|').filter((c, idx, arr) => !(idx === 0 && !c.trim()) && !(idx === arr.length - 1 && !c.trim())).map(c => c.trim()))
        j++
      }
      const block: string[] = []
      if (headerCells.length) block.push('*' + headerCells.join(' · ') + '*')
      for (const r of rows) {
        block.push('• ' + r.join(' · '))
      }
      out.push(block.join('\n'))
      i = j
      continue
    }
    out.push(line)
    i++
  }
  return out.join('\n')
}

function mdToTelegram(content: string): string {
  if (!content) return content
  const placeholders: Record<string, string> = {}
  let counter = 0
  const ph = (value: string): string => { const key = `\x00PH${counter}\x00`; counter++; placeholders[key] = value; return key }

  let text = convertTableToBullets(content)

  // 1) 保护围栏代码块 ```...```
  text = text.replace(/(```(?:[^\n]*\n)?[\s\S]*?```)/g, (raw) => {
    const openEnd = raw.includes('\n') ? raw.indexOf('\n') + 1 : 3
    const opening = raw.slice(0, openEnd)
    let body = raw.slice(openEnd, -3)
    body = body.replace(/\\/g, '\\\\').replace(/`/g, '\\`')
    return ph(opening + body + '```')
  })
  // 2) 保护内联代码 `...`
  text = text.replace(/(`[^`]+`)/g, (m) => ph(m.replace(/\\/g, '\\\\')))
  // 3) 链接 [text](url)
  text = text.replace(/\[([^\]]+)\]\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g, (m, display, url) => {
    const d = escapeMdv2(display)
    const u = url.replace(/\\/g, '\\\\').replace(/\)/g, '\\)')
    return ph(`[${d}](${u})`)
  })
  // 4) 标题 ## → 粗体 *text*
  text = text.replace(/^#{1,6}\s+(.+)$/gm, (m, inner) => {
    inner = inner.replace(/\*\*(.+?)\*\*/g, '$1')
    return ph(`*${escapeMdv2(inner.trim())}*`)
  })
  // 5) 粗体 **text** → *text*
  text = text.replace(/\*\*(.+?)\*\*/g, (m, inner) => ph(`*${escapeMdv2(inner)}*`))
  // 6) 斜体 *text* → _text_
  text = text.replace(/\*([^*\n]+)\*/g, (m, inner) => ph(`_${escapeMdv2(inner)}_`))
  // 7) 删除线 ~~text~~ → ~text~
  text = text.replace(/~~(.+?)~~/g, (m, inner) => ph(`~${escapeMdv2(inner)}~`))
  // 8) 引用 > text → 保护 >
  text = text.replace(/^((?:\*\*)?>{1,3}) (.+)$/gm, (m, prefix, inner) => ph(`${prefix} ${escapeMdv2(inner)}`))
  // 9) 转义剩余特殊字符
  text = escapeMdv2(text)
  // 10) 恢复占位符（逆序，支持嵌套）
  const keys = Object.keys(placeholders)
  for (let i = keys.length - 1; i >= 0; i--) {
    text = text.replace(new RegExp(keys[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), placeholders[keys[i]])
  }
  return text
}
// 从 tool/result 的 message.content（[ToolResultBlock]）抽取文本
function toolResultText(m: any): string {
  const parts: string[] = []
  for (const b of (m?.content || [])) {
    if (b?.type === 'tool-result') { for (const x of (b.content || [])) if (x?.type === 'text' && x.text) parts.push(x.text) }
    else if (b?.type === 'text' && b.text) parts.push(b.text)
  }
  return parts.join('')
}

// Telegram 单条消息上限 4096，按段落切分成长块，避免截断
function splitMessages(text: string, max = 3900): string[] {
  if (!text) return []
  if (text.length <= max) return [text]
  const chunks: string[] = []
  let cur = ''
  for (const line of text.split('\n')) {
    if (cur.length + line.length + 1 > max && cur) {
      chunks.push(cur)
      cur = line
    } else {
      cur += (cur ? '\n' : '') + line
    }
  }
  if (cur) chunks.push(cur)
  // 仍超长的单行（无换行）硬切
  const out: string[] = []
  for (const c of chunks) {
    if (c.length <= max) out.push(c)
    else { for (let i = 0; i < c.length; i += max) out.push(c.slice(i, i + max)) }
  }
  return out
}

// ── 工具调用预览：Hermes 风格的人类可读短语 ──────────────
// 移植自 Hermes agent 的 display.py：动词 + 主参数摘要，不显示原始 JSON
const TOOL_VERBS: Record<string, string> = {
  web_search: 'Searching the web',
  web_extract: 'Reading',
  browser_navigate: 'Browsing',
  browser_click: 'Clicking',
  browser_type: 'Typing',
  read_file: 'Reading',
  write_file: 'Writing',
  patch: 'Editing',
  search_files: 'Searching files',
  terminal: 'Running',
  execute_code: 'Running code',
  image_generate: 'Generating image',
  video_generate: 'Generating video',
  text_to_speech: 'Generating speech',
  vision_analyze: 'Looking at',
  session_search: 'Searching past sessions',
  skill_view: 'Reading skill',
  skills_list: 'Listing skills',
  skill_manage: 'Updating skill',
  delegate_task: 'Delegating',
  cronjob: 'Scheduling',
  clarify: 'Asking',
  memory: 'Updating memory',
  todo: 'Updating tasks',
  // DSH / veryIM 特有工具
  list_secrets: 'Listing secrets',
  resolve_secret: 'Resolving secret',
  credential_exec: 'Running credential',
  credential_http: 'Calling credential',
}
const TOOLS_NO_PREVIEW = new Set(['skills_list', 'session_search'])
const TOOLS_FOR_CONNECTOR = new Set(['web_search', 'search_files'])

// 提取工具名的"人类可读预览"——从参数中取最关键的字段
function toolPreview(name: string, args: any): string {
  const a = typeof args === 'string' ? (() => { try { return JSON.parse(args) } catch { return {} } })() : (args || {})
  if (name === 'terminal' || name === 'execute_code') {
    const cmd = (a.command || a.code || '').trim()
    // 取第一行、去掉前后空白
    const first = cmd.split('\n')[0].trim()
    return first.length > 80 ? first.slice(0, 77) + '…' : first
  }
  if (name === 'read_file') return basename(a.path || a.file || a.filepath || '')
  if (name === 'write_file' || name === 'patch') return basename(a.path || a.file || '')
  if (name === 'search_files') return a.pattern || ''
  if (name === 'web_search') return a.query || ''
  if (name === 'skill_view') return a.name || ''
  if (name === 'skill_manage') return (a.action || '') + ' ' + (a.name || '')
  if (name === 'memory') return (a.action || '') + ' ' + (a.target || '')
  if (name === 'todo') return (a.action || '') + ' ' + (Array.isArray(a.todos) ? a.todos.length + ' tasks' : '')
  if (name === 'cronjob') return a.action || ''
  if (name === 'clarify') return a.question ? a.question.slice(0, 40) + (a.question.length > 40 ? '…' : '') : ''
  if (name === 'delegate_task') return a.goal ? a.goal.slice(0, 50) + (a.goal.length > 50 ? '…' : '') : ''
  // 通用回退：取 args 的第一个字符串值
  for (const v of Object.values(a)) { if (typeof v === 'string' && v.trim()) return v.slice(0, 60) + (v.length > 60 ? '…' : '') }
  return ''
}
function basename(p: string): string { return p.split('/').pop() || p }

// 生成一条工具调用的完整短语（动词 + 预览）
function toolLabel(name: string, args: any): string {
  const verb = TOOL_VERBS[name] || 'Using'
  if (TOOLS_NO_PREVIEW.has(name)) return verb
  const preview = toolPreview(name, args)
  if (!preview) return verb
  const conn = TOOLS_FOR_CONNECTOR.has(name) ? ' for ' : ' '
  return verb + conn + preview
}

// ── 收集本回合（minTurn 之后）的思考文本 ──
function collectThinking(events: any[], minTurn = 0): string {
  const t: string[] = []
  let live = ''
  for (const ev of events) {
    const e = ev?.event
    if (!e) continue
    const d = e.data || {}
    if (minTurn > 0 && typeof d.turn === 'number' && d.turn < minTurn) continue
    if (e.type === 'assistant/chunk') {
      const c = d.chunk || {}
      if (c.type === 'reasoning-delta') live += c.text
    } else if (e.type === 'assistant/message') {
      for (const b of (d.message?.content || [])) {
        if (b?.type === 'reasoning' && b.text) t.push(b.text)
      }
    }
  }
  const full = (t.length ? t.join('\n\n') : '') + (live ? (t.length ? '\n\n' : '') + live : '')
  return full.trim()
}

// 收集本回合的最终回复文本（assistant text block）
function collectAnswer(events: any[], minTurn = 0): string {
  const a: string[] = []
  for (const ev of events) {
    const e = ev?.event
    if (!e) continue
    const d = e.data || {}
    if (minTurn > 0 && typeof d.turn === 'number' && d.turn < minTurn) continue
    if (e.type === 'assistant/message') {
      for (const b of (d.message?.content || [])) {
        if (b?.type === 'text' && b.text) a.push(b.text)
      }
    }
  }
  return a.join('\n\n').trim()
}

// ── HTTP 工具 ───────────────────────────────────────────
function json(res: ServerResponse, data: any, status = 200) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*' })
  res.end(JSON.stringify(data))
}
async function body(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = []; for await (const c of req) chunks.push(c as Buffer)
  return JSON.parse(Buffer.concat(chunks).toString('utf-8'))
}

const VeryIMConfig = Schema.object({ enabled: Schema.boolean().default(true) }, { additionalProperties: true })

// ── 插件入口 ────────────────────────────────────────────
// 仅声明真实用到的服务；之前的 tools/systemPrompt 未使用却是硬依赖，可能导致 apply 永不执行
export const inject = ['webServer', 'settings']
export const name = 'dsh-veryIM'

export function apply(ctx: any) {
  ctx.settings?.register(settingsNamespace('veryim'), VeryIMConfig, { base: { enabled: true } })

  // status：回传 botToken 供编辑表单明文显示
  ctx.webServer.register({ kind: 'exact', path: '/plugins/dsh-veryIM/status',
    handler: async (_: IncomingMessage, res: ServerResponse) => {
      json(res, { ok: true, channels: loadCfg().channels.map(c => ({ ...c, botToken: c.botToken || "" })) })
    } })

  // test：可用临时 proxy 校验 token
  ctx.webServer.register({ kind: 'exact', path: '/plugins/dsh-veryIM/test',
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      try {
        const { botToken, proxy } = await body(req)
        if (!botToken) { json(res, { ok: false, error: 'botToken required' }, 400); return }
        const disp = proxy ? (() => { try { return new ProxyAgent(proxy) } catch (e: any) { console.warn('[dsh-veryIM] test 代理不可用，回退系统代理: ' + e.message); return undefined } })() : undefined
        let me: any
        try {
          me = await tgRaw(botToken, '/getMe', {}, disp)
        } catch (e: any) {
          if (!disp) { json(res, { ok: false, error: e.cause?.message || e.message }, 400); return }
          // per-channel 代理网络层失败 → 回退系统代理（全局 fetch）再试一次
          try { me = await tgRaw(botToken, '/getMe', {}) }
          catch (e2: any) { json(res, { ok: false, error: e2.cause?.message || e2.message }, 400); return }
        }
        if (!me.ok) { json(res, { ok: false, error: me.description }, 400); return }
        json(res, { ok: true, id: me.result.id, username: me.result.username, name: me.result.first_name })
      } catch (e: any) { json(res, { ok: false, error: e.cause?.message || e.message }, 500) }
    } })

  // check：健康检查
  ctx.webServer.register({ kind: 'exact', path: '/plugins/dsh-veryIM/check',
    handler: async (_: IncomingMessage, res: ServerResponse) => {
      try {
        const cfg = loadCfg()
        const results = await Promise.all(cfg.channels.map(async (ch: any) => {
          const t0 = Date.now()
          try {
            const me = await tg(ch, '/getMe')
            return { id: ch.id, name: ch.name, username: ch.botUsername, type: 'telegram',
              healthy: !!me.ok, latencyMs: Date.now() - t0, error: me.ok ? undefined : me.description,
              workspace: ch.workspace || null }
          } catch (e: any) {
            return { id: ch.id, name: ch.name, username: ch.botUsername, type: 'telegram',
              healthy: false, latencyMs: Date.now() - t0, error: e.message, workspace: ch.workspace || null }
          }
        }))
        json(res, { ok: true, channels: results, supported: [{ type: 'telegram', name: 'Telegram', desc: 'Bot API 长轮询' }] })
      } catch (e: any) { json(res, { ok: false, error: e.message }, 500) }
    } })

  // save：编辑已有渠道时若未提供新 botToken，则沿用旧 token；更新时保留 workspace/proxy/lastUpdateId
  ctx.webServer.register({ kind: 'exact', path: '/plugins/dsh-veryIM/save',
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      try {
        const { id, botToken, name, workspace, proxy } = await body(req)
        const cfg = loadCfg()
        const ex = cfg.channels.find((c: any) => c.id === id)
        const finalToken = botToken || ex?.botToken
        if (!finalToken) { json(res, { ok: false, error: 'botToken required' }, 400); return }
        // 只有真正更换了 token 才需要向 Telegram 校验；改代理/工作区时跳过，避免被校验卡住
        const tokenChanged = !!(botToken && botToken !== ex?.botToken)
        const ch: any = {
          id: ex?.id || `ch-${Date.now()}`, type: 'telegram',
          name: name || ex?.name,
          botToken: finalToken,
          botUsername: ex?.botUsername,
          botId: ex?.botId,
          enabled: true,
          connectedAt: ex?.connectedAt || new Date().toISOString(),
          lastUpdateId: ex?.lastUpdateId || 0,
          workspace: workspace !== undefined ? workspace : ex?.workspace,
          proxy: proxy !== undefined ? proxy : ex?.proxy,
        }
        if (tokenChanged) {
          const disp = proxy ? (() => { try { return new ProxyAgent(proxy) } catch (e: any) { console.warn('[dsh-veryIM] save 代理不可用: ' + e.message); return undefined } })() : undefined
          let me: any
          try {
            me = await tgRaw(botToken, '/getMe', {}, disp)
          } catch (e: any) {
            if (!disp) throw e
            // per-channel 代理网络层失败 → 回退系统代理再校验一次
            me = await tgRaw(botToken, '/getMe', {})
          }
          if (!me.ok) { json(res, { ok: false, error: me.description || 'Token 无效' }, 400); return }
          ch.botUsername = me.result.username
          ch.botId = String(me.result.id)
          ch.name = name || me.result.first_name
        }
        if (ex) Object.assign(ex, ch); else cfg.channels.push(ch)
        saveCfg(cfg); dispatchers.delete(ch.id); stopPoll(ch.id); startPoll(ch)
        json(res, { ok: true, channel: { ...ch, botToken: undefined } })
      } catch (e: any) { json(res, { ok: false, error: e.cause?.message || e.message }, 500) }
    } })

  // delete
  ctx.webServer.register({ kind: 'exact', path: '/plugins/dsh-veryIM/delete',
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      try {
        const { id } = await body(req)
        const cfg = loadCfg()
        cfg.channels = cfg.channels.filter((c: any) => c.id !== id)
        saveCfg(cfg); stopPoll(id); dispatchers.delete(id)
        json(res, { ok: true })
      } catch (e: any) { json(res, { ok: false, error: e.message }, 500) }
    } })

  const cfg = loadCfg()
  for (const ch of cfg.channels) { if (ch.enabled) startPoll(ch) }
  console.log(`[dsh-veryIM] 插件已加载，${cfg.channels.length} 个渠道`)
}

/** dsh-veryIM 服务端 v5 — 系统代理 + 渠道级工作区 + 智能检测 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, basename } from 'path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { ProxyAgent, fetch as proxyFetch } from 'undici'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import Schema from '@deepseek-ai/schemastery'
import { setApprovalPolicy } from '@deepseek-ai/dsh-user-approval'

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
// 系统代理（HTTPS_PROXY）的 ProxyAgent——裸 fetch 不读该变量，必须显式构造 dispatcher
const SYSTEM_PROXY = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || ''
let systemDispatcher: ProxyAgent | undefined
function systemDispatcherFor(): ProxyAgent | undefined {
  if (!SYSTEM_PROXY) return undefined
  if (systemDispatcher) return systemDispatcher
  try { systemDispatcher = new ProxyAgent(SYSTEM_PROXY) } catch { systemDispatcher = undefined }
  return systemDispatcher
}
async function tgRaw(token: string, path: string, opts: any = {}, dispatcher?: ProxyAgent) {
  const url = `${TG}/bot${token}${path}`
  // 1) per-channel 代理（若有）：失败先重试一次
  if (dispatcher) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await proxyFetch(url, { ...opts, dispatcher }).then(r => r.json())
      } catch (e: any) {
        console.warn(`[dsh-veryIM] per-channel 代理请求失败(第${attempt + 1}/2: ${e.cause?.message || e.message})，重试/回退系统代理`)
        if (attempt === 0) await sleep(1500)
      }
    }
  }
  // 2) 系统代理（显式 ProxyAgent，而非裸 fetch）
  const sysDisp = systemDispatcherFor()
  if (sysDisp) {
    try {
      return await proxyFetch(url, { ...opts, dispatcher: sysDisp }).then(r => r.json())
    } catch (e: any) {
      console.warn(`[dsh-veryIM] 系统代理请求失败(${e.cause?.message || e.message})，尝试直连`)
    }
  }
  // 3) 直连兜底
  return fetch(url, opts).then(r => r.json())
}
async function tg(ch: any, path: string, opts: any = {}) {
  return tgRaw(ch.botToken, path, opts, dispatcherFor(ch))
}

// ── DSH RPC（直连 localhost，NO_PROXY 保护） ─────────────
// 端口可从环境变量 VERYIM_DSH_PORT 覆盖（默认 3080），避免 DSH 换端口插件全挂
const DSH_BASE = process.env.VERYIM_DSH_PORT
  ? `http://127.0.0.1:${process.env.VERYIM_DSH_PORT}`
  : 'http://127.0.0.1:3080'
async function dsh(method: string, payload: any) {
  try {
    const r = await fetch(`${DSH_BASE}/api/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: `vi-${Date.now()}-${Math.random().toString(36).slice(2,6)}`, method, payload }),
    })
    return await r.json()
  } catch (e: any) {
    console.warn(`[dsh-veryIM] dsh(${method}) error:`, e?.message)
    return null
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// ── 长轮询 ─────────────────────────────────────────────
const polls = new Map<string, AbortController>()
// 同一 chat 并发消息时，会话创建去重，避免双开会话
const sessionLocks = new Map<string, Promise<string>>()
// 每个 chat 的"代次"：新消息到达 +1，让旧回复轮询立即停止（防重复/支持打断）
// 值含时间戳 t：轮询结束后按代次清理；不按时间清（长任务轮询可持续 30 分钟+，清早了会误杀活跃轮询）
const chatGens = new Map<string, { gen: number; t: number }>()
// 消息去重：避免同一 update 被重放导致重复处理
const recentMsgs = new Map<string, { id: number; t: number }>()

// ── Map 定期清扫：防长期运行内存缓慢增长 ──
// recentMsgs 只用于 60s 去重窗，超窗条目即可丢；chatGens 由轮询结束后自行清理
function sweepMaps() {
  const now = Date.now()
  for (const [k, v] of recentMsgs) {
    if (now - v.t > 70000) recentMsgs.delete(k) // 60s 去重窗 + 余量
  }
  // chatGens 不在此清理：活跃轮询可能很长，等轮询结束按代次 delete
}
const sweepTimer = setInterval(sweepMaps, 5 * 60 * 1000)
sweepTimer.unref?.()

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
  // 注册 Telegram 命令菜单（/menu /new /cancel），失败不影响轮询
  tg(ch, '/setMyCommands', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commands: [
      { command: 'menu', description: '查看可用命令' },
      { command: 'new', description: '新开一个对话' },
      { command: 'cancel', description: '取消当前回复' },
    ] }),
  }).catch(() => {})
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
        if (msg?.from?.is_bot) continue
        // 白名单：allowlist 非空时只处理名单内用户（user id），其他静默忽略
        // 注意：from.id 缺失也拒绝（防恶意构造无 from 的消息绕过白名单）
        const wl = Array.isArray(ch.allowlist) ? ch.allowlist : []
        if (wl.length > 0 && (!msg.from?.id || !wl.includes(msg.from.id))) continue
        // 媒体消息（图/文件/语音/视频/贴纸/GIF）→ 上行处理；无媒体的纯文本 → 正常对话
        const hasMedia = !!(msg.photo || msg.document || msg.voice || msg.video || msg.audio || msg.sticker || msg.animation)
        if (hasMedia) { handleMediaMsg(ch, msg).catch(e => log(`handleMediaMsg err: ${e.message}`)); continue }
        if (!msg?.text) continue
        handleMsg(ch, msg).catch(e => log(`handleMsg err: ${e.message}`))
      }
    } catch (e: any) {
      if (signal.aborted) break
      log(`poll err: ${e.message}`)
      await sleep(5000)
    }
  }
}

// persistOffset 节流：内存立即更新，落盘 5 秒防抖批量写（高频消息不每条约写一次 config.json）
const persistTimers = new Map<string, NodeJS.Timeout>()
function persistOffset(ch: any) {
  // 先立即更新内存里的 channel.lastUpdateId（同进程内持久）
  const cfg = loadCfg()
  const ex = cfg.channels.find((c: any) => c.id === ch.id)
  if (!ex) return
  ex.lastUpdateId = ch.lastUpdateId
  // 防抖：5 秒内的多次调用合并为一次 saveCfg
  const prev = persistTimers.get(ch.id)
  if (prev) clearTimeout(prev)
  persistTimers.set(ch.id, setTimeout(() => {
    persistTimers.delete(ch.id)
    saveCfg(cfg)
  }, 5000))
}

// 模块级：发送图片（媒体下行），供 handleMsg / handleMediaMsg 共用
async function sendPhotoModule(
  ch: any, chatId: number,
  att: { attachmentId: string; mediaType: string; name?: string },
  caption?: string,
): Promise<any | null> {
  try {
    const imgRes = await fetch(`${DSH_BASE}/plugins/dsh-makemake/image?attachmentId=${encodeURIComponent(att.attachmentId)}`, { redirect: 'error' })
    if (!imgRes.ok) { console.warn(`[dsh-veryIM] ${ch.name} 读取附件失败: HTTP ${imgRes.status}`); return null }
    const buf = Buffer.from(await imgRes.arrayBuffer())
    if (buf.length === 0) return null
    const form = new FormData()
    const ext = (att.mediaType || 'image/jpeg').split('/')[1]?.replace('jpeg', 'jpg') || 'jpg'
    form.append('chat_id', String(chatId))
    form.append('photo', new Blob([new Uint8Array(buf)], { type: att.mediaType || 'image/jpeg' }), `${att.name || 'image'}.${ext}`)
    if (caption) form.append('caption', mdToTelegram(caption))
    const url = `https://api.telegram.org/bot${ch.botToken}/sendPhoto`
    // 走代理容错：per-channel → 系统 → 直连
    let lastErr: any = null
    const disp = dispatcherFor(ch)
    if (disp) { try { return await (await proxyFetch(url, { method: 'POST', body: form, dispatcher: disp })).json() } catch (e: any) { lastErr = e } }
    const sysDisp = systemDispatcherFor()
    if (sysDisp) { try { return await (await proxyFetch(url, { method: 'POST', body: form, dispatcher: sysDisp })).json() } catch (e: any) { lastErr = e } }
    try { return await (await fetch(url, { method: 'POST', body: form })).json() } catch (e: any) { lastErr = e }
    if (lastErr) console.warn(`[dsh-veryIM] ${ch.name} sendPhoto 网络失败: ${lastErr.cause?.message || lastErr.message}`)
    return null
  } catch (e: any) {
    console.warn(`[dsh-veryIM] ${ch.name} sendPhoto 失败: ${e.message}`)
    return null
  }
}

// 从 Telegram 下载文件（getFile → 获取 file_path → 下载字节）
async function tgDownloadFile(ch: any, fileId: string): Promise<Buffer | null> {
  try {
    const resp = await tg(ch, `/getFile?file_id=${encodeURIComponent(fileId)}`)
    if (!resp?.ok || !resp.result?.file_path) return null
    const url = `https://api.telegram.org/file/bot${ch.botToken}/${resp.result.file_path}`
    // 三层代理降级：per-channel → 系统代理 → 直连（与 sendPhoto 一致，代理抖动不丢文件）
    let lastErr: any = null
    const disp = dispatcherFor(ch)
    if (disp) { try { const r = await proxyFetch(url, { redirect: 'error', dispatcher: disp }); if (r.ok) { const b = Buffer.from(await r.arrayBuffer()); if (b.length > 0) return b } } catch (e: any) { lastErr = e } }
    const sysDisp = systemDispatcherFor()
    if (sysDisp) { try { const r = await proxyFetch(url, { redirect: 'error', dispatcher: sysDisp }); if (r.ok) { const b = Buffer.from(await r.arrayBuffer()); if (b.length > 0) return b } } catch (e: any) { lastErr = e } }
    try { const r = await fetch(url, { redirect: 'error' }); if (r.ok) { const b = Buffer.from(await r.arrayBuffer()); if (b.length > 0) return b } } catch (e: any) { lastErr = e }
    if (lastErr) console.warn(`[dsh-veryIM] ${ch.name} 下载文件失败: ${lastErr.cause?.message || lastErr.message}`)
    return null
  } catch { return null }
}

// 媒体上行：用户发图/文件/语音 → 下载 → 存到会话 .uploads/ → 注入 session.prompt
async function handleMediaMsg(ch: any, msg: any) {
  const chatId = msg.chat.id
  const key = `${ch.id}:${chatId}`
  const msgId = msg.message_id
  // 去重（同媒体消息 60s 内不重复处理）
  const prev = recentMsgs.get(key)
  if (prev && prev.id === msgId && Date.now() - prev.t < 60000) return
  recentMsgs.set(key, { id: msgId, t: Date.now() })

  const send = async (t: string) => {
    const md = mdToTelegram(t)
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        let resp = await tg(ch, '/sendMessage', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: md, parse_mode: 'MarkdownV2', reply_to_message_id: msgId, allow_sending_without_reply: true }),
        })
        if (!resp?.ok && /parse|entity|UTF|invalid/i.test(resp?.description || '')) {
          resp = await tg(ch, '/sendMessage', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: t, reply_to_message_id: msgId, allow_sending_without_reply: true }),
          })
        }
        if (resp?.ok) return resp
      } catch { if (attempt < 1) await sleep(2000) }
    }
    return null
  }

  // 提取媒体信息：优先 photo（取最大尺寸），其次 document/voice/video/audio
  let fileId = ''
  let fileName = ''
  if (msg.photo) {
    const photo = msg.photo[msg.photo.length - 1]  // 最大尺寸
    fileId = photo.file_id
    fileName = `photo_${msgId}.jpg`
  } else if (msg.document) {
    fileId = msg.document.file_id
    fileName = msg.document.file_name || `doc_${msgId}`
  } else if (msg.voice) {
    fileId = msg.voice.file_id
    fileName = `voice_${msgId}.ogg`
  } else if (msg.video) {
    fileId = msg.video.file_id
    fileName = msg.video.file_name || `video_${msgId}.mp4`
  } else if (msg.audio) {
    fileId = msg.audio.file_id
    fileName = msg.audio.file_name || (msg.audio.title ? `${msg.audio.title}.mp3` : `audio_${msgId}.mp3`)
  } else if (msg.sticker) {
    fileId = msg.sticker.file_id
    fileName = `sticker_${msgId}.${msg.sticker.is_animated ? 'tgs' : 'webp'}`
  } else if (msg.animation) {
    fileId = msg.animation.file_id
    fileName = msg.animation.file_name || `animation_${msgId}.mp4`
  }
  if (!fileId) { await send('⚠️ 无法识别的文件类型'); return }

  // 下载文件
  const buf = await tgDownloadFile(ch, fileId)
  if (!buf || buf.length === 0) { await send('⚠️ 无法下载文件，请稍后重试'); return }

  // 获取会话 id，存文件到会话 .uploads/
  let sid = getSes(key)
  if (!sid) {
    sid = await createSessionLocked(key, ch)
    if (sid) updateSes(s => { s[key] = sid })
  }
  if (!sid) { await send('❌ 无法创建对话会话'); return }

  // 安全文件名（basename only + 时间戳后缀防重名）
  const safeBase = basename(fileName).replace(/[/\\\0]/g, '_')
  const dot = safeBase.lastIndexOf('.')
  const ts = Date.now().toString()
  const unique = dot >= 0 ? `${safeBase.slice(0, dot)}_${ts}${safeBase.slice(dot)}` : `${safeBase}_${ts}`

  // 写入会话 .uploads/ 目录
  try {
    const ws = await dsh('workspace.list', {}).catch(() => null)
    const wsItems: any[] = ws?.result?.value?.items ?? []
    const targetWs = wsItems.find((w: any) => w.path === ch.workspace)
    const cwd = targetWs?.path || '/root/DSH'
    const uploadDir = join(cwd, '.uploads')
    mkdirSync(uploadDir, { recursive: true })
    writeFileSync(join(uploadDir, unique), buf)
  } catch (e: any) {
    console.warn(`[dsh-veryIM] ${ch.name} 存文件失败: ${e.message}`)
    await send('⚠️ 文件保存失败，请稍后重试')
    return
  }

  // 注入会话：告诉 agent 有文件，用 [f:xxx] 标记让 looklook_see 能识别
  // 带上 caption（用户发的文字提问），否则 agent 只看到文件名不知道用户想问什么
  const fileTag = `[f:${unique}]`
  const caption = (msg.caption || '').trim()
  const promptText = caption
    ? `用户上传了文件「${fileName}」${fileTag}，并附言：${caption}。请结合用户的问题查看文件内容。`
    : `用户上传了文件「${fileName}」${fileTag}。请查看文件内容。`
  const promptResp = await dsh('session.prompt', { sessionId: sid, mode: 'queue', content: [{ type: 'text', text: promptText }] })
  if (!promptResp?.result?.ok) {
    await send('❌ 消息发送失败，请稍后重试')
    return
  }

  // 发送确认消息，然后进入轮询等待回复
  const sent = await send(`📎 已收到文件「${fileName}」，正在处理…`)
  const sentId = sent?.ok ? sent.result?.message_id : null

  // ── 轮询回复（复用了 handleMsg 的轮询逻辑，简化版）──
  const myGen = (chatGens.get(key)?.gen || 0) + 1
  chatGens.set(key, { gen: myGen, t: Date.now() })

  let thinkingMsgId: number | null = sentId
  let shownThinking = ''
  const shownTools = new Set<string>()
  const shownAnswerIds = new Set<string>()
  const shownMedia = new Set<string>()

  for (let i = 0; i < 2400; i++) {
    if (chatGens.get(key)?.gen !== myGen) break
    await sleep(1500)
    if (i % 2 === 0) await tg(ch, '/sendChatAction', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, action: 'typing' }) }).catch(() => {})
    let events: any[] = []
    try {
      const msgs = await dsh('session.history', { sessionId: sid })
      events = (msgs?.result?.value?.events || [])
    } catch { continue }

    const thinking = collectThinking(events, 0)
    if (thinking && thinking !== shownThinking) {
      shownThinking = thinking
      const brief = summarizeThinking(thinking)
      const text = '🤔 ' + brief
      if (thinkingMsgId) await tg(ch, '/editMessageText', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, message_id: thinkingMsgId, text: mdToTelegram(text), parse_mode: 'MarkdownV2' }) }).catch(() => {})
      else { const s = await send(text); if (s?.ok) thinkingMsgId = s.result.message_id }
    }

    // 工具气泡
    for (const ev of events) {
      const e = ev?.event
      if (!e || e.type !== 'tool/call') continue
      const d = e.data || {}
      const name = d.name || ''; const args = d.arguments || ''
      const sig = `${name} ${args}`.trim()
      if (!shownTools.has(sig)) { shownTools.add(sig); await send('⚙️ ' + toolLabel(name, args)) }
    }

    // 回复
    const answers = collectAnswers(events, 0)
    for (const a of answers) {
      if (shownAnswerIds.has(a.key)) continue
      const model = collectModel(events, 0)
      const footer = model ? `\n\n────────\n🤖 ${model}` : ''
      const s = await send(a.text + footer)
      if (s?.ok) shownAnswerIds.add(a.key)
    }
    if (shownAnswerIds.size > 0 && thinkingMsgId) {
      await tg(ch, '/deleteMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, message_id: thinkingMsgId }) }).catch(() => {})
      thinkingMsgId = null
    }

    // 媒体下行（失败不标记已发，下轮重试）
    const media = collectMedia(events, 0)
    for (const att of media) {
      if (shownMedia.has(att.attachmentId)) continue
      const ok = await sendPhotoModule(ch, chatId, att, att.name ? `📎 ${att.name}` : undefined)
      if (ok?.ok) shownMedia.add(att.attachmentId)
    }

    let items: any[] = []
    try { items = await dsh('session.list', {}).then(r => r?.result?.value?.items || []) } catch {}
    if (!items.find((s: any) => s.sessionId === sid)?.running) break
  }
  // 轮询结束：若仍是当前代次（无新消息插入），删除该 chat 的代次键，防内存增长
  if (chatGens.get(key)?.gen === myGen) chatGens.delete(key)
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
  const myGen = (chatGens.get(key)?.gen || 0) + 1
  chatGens.set(key, { gen: myGen, t: Date.now() })

  const send = async (t: string, reply = false) => {
    const md = mdToTelegram(t)
    // reply=true 时引用用户原文，其他情况不引用
    const base: any = { chat_id: chatId, text: md, parse_mode: 'MarkdownV2', ...(reply ? { reply_to_message_id: msgId, allow_sending_without_reply: true } : {}) }
    // 失败重试 3 次，不向上抛异常（一次网络失败不能中断整个消息处理）
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        let resp: any = await tg(ch, '/sendMessage', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(base),
        })
        // MarkdownV2 解析失败（未闭合代码块/残留特殊字符）→ 回退纯文本
        if (!resp?.ok && /parse|entity|UTF|invalid/i.test(resp?.description || '')) {
          resp = await tg(ch, '/sendMessage', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...base, text: t, parse_mode: undefined }),
          })
        }
        return resp
      } catch (e: any) {
        console.warn(`[dsh-veryIM] ${ch.name} sendMessage 失败(第${attempt + 1}/3): ${e.message}`)
        if (attempt < 2) await sleep(2000)
      }
    }
    return null
  }
  // 发送图片：通过 DSH 附件路由读取 attachment 字节 → sendPhoto（multipart/form-data）
  const sendPhoto = (att: { attachmentId: string; mediaType: string; name?: string }, caption?: string) =>
    sendPhotoModule(ch, chatId, att, caption)
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
  // 删除消息（用于回复出现后删掉思考气泡）
  const del = (messageId: number) => tg(ch, '/deleteMessage', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
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

  // 确保会话挂进渠道工作区（避免 DSH 把新会话显示为"未分组"）
  if (ch?.workspace) {
    try {
      // 找渠道工作区 id
      const wsList = await dsh('workspace.list', {}).catch(() => null)
      const wsItems: any[] = wsList?.result?.value?.items ?? []
      const targetWs = wsItems.find((w: any) => w.path === ch.workspace)
      if (targetWs && !targetWs.sessionIds?.includes(sid)) {
        await dsh('workspace.insertSessionBefore', { workspaceId: targetWs.workspaceId, sessionId: sid }).catch(() => {})
      }
    } catch { /* ignore */ }
  }

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

  // ── 轮询：思考气泡 + 每条命令独立气泡 + 回复各自独立 ──
  let thinkingMsgId: number | null = sentId  // 打断消息或思考消息 id
  let shownThinking = ''
  // 已发出气泡的工具调用（按"工具名+参数摘要"去重，避免重复发同一条）
  const shownTools = new Set<string>()
  // 已发送的回复 key（每条 assistant text 独立气泡，不 edit 覆盖）
  const shownAnswerIds = new Set<string>()
  // 已发送的图片附件（按 attachmentId 去重，避免重复发图）
  const shownMedia = new Set<string>()

  for (let i = 0; i < 2400; i++) {
    if (chatGens.get(key)?.gen !== myGen) break   // 已被更新的消息取代 → 立即停止
    await sleep(1500)
    if (i % 2 === 0) await typing().catch(() => {})
    let events: any[] = []
    try {
      const msgs = await dsh('session.history', { sessionId: sid })
      events = (msgs?.result?.value?.events || [])
    } catch (e: any) {
      // 单次 RPC 失败（如 dsh 重启窗口）不中断，下一轮继续
      console.warn(`[dsh-veryIM] ${ch.name} 轮询 history 失败: ${e.message}`)
      continue
    }

    // 1) 思考 → 渐进填充一条 🤔 消息（让用户看到进度不干等；回复出现后删除）
    const thinking = collectThinking(events, minTurn)
    if (thinking && thinking !== shownThinking) {
      shownThinking = thinking
      const brief = summarizeThinking(thinking)
      const text = '🤔 ' + brief
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

    // 3) 回复气泡：每条 assistant text 独立气泡，绝不 edit 覆盖。
    //    中间回复（"好的，我来查看..."）和最终回复各自一条，互不替换
    const answers = collectAnswers(events, minTurn)
    for (const a of answers) {
      if (shownAnswerIds.has(a.key)) continue  // 已发过这条
      // 底部固定格式行：显示当前 IM 渠道所用的模型
      const model = collectModel(events, minTurn)
      const footer = model ? `\n\n────────\n🤖 ${model}` : ''
      const display = a.text + footer
      const s = await send(display, true)
      if (s?.ok) shownAnswerIds.add(a.key)
    }
    // ★ 回复出现后立即删除思考气泡（第一条回复发出即删）
    if (shownAnswerIds.size > 0 && thinkingMsgId) { await del(thinkingMsgId); thinkingMsgId = null }

    // 4) 媒体下行：回合内出现的图片附件 → sendPhoto 发给用户（失败不标记已发，下轮重试）
    const media = collectMedia(events, minTurn)
    for (const att of media) {
      if (shownMedia.has(att.attachmentId)) continue
      // caption 用附件名（如果有），否则空
      const ok = await sendPhoto(att, att.name ? `📎 ${att.name}` : undefined)
      if (ok?.ok) shownMedia.add(att.attachmentId)
    }

    let items: any[] = []
    try { items = await dsh('session.list', {}).then(r => r?.result?.value?.items || []) } catch (e: any) { console.warn(`[dsh-veryIM] ${ch.name} session.list 失败: ${e.message}`) }
    if (!items.find((s: any) => s.sessionId === sid)?.running) break
  }

  // ── 兜底：若全程没显示过回复（极少数竞态），session 结束后补发所有未发送的回复 ──
  const lastEvents: any[] = []
  try { const msgs = await dsh('session.history', { sessionId: sid }); lastEvents.push(...(msgs?.result?.value?.events || [])) } catch { /* ignore */ }
  const answers = collectAnswers(lastEvents, minTurn)
  const unsent = answers.filter(a => !shownAnswerIds.has(a.key))
  for (const a of unsent) {
    const model = collectModel(lastEvents, minTurn)
    const footer = model ? `\n\n────────\n🤖 ${model}` : ''
    const s = await send(a.text + footer, true)
    if (s?.ok) shownAnswerIds.add(a.key)
  }
  if (shownAnswerIds.size > 0 && thinkingMsgId) { await del(thinkingMsgId); thinkingMsgId = null }

  // 超时仍在处理 → 更新思考气泡上的提示
  let sitems: any[] = []
  try { sitems = await dsh('session.list', {}).then(r => r?.result?.value?.items || []) } catch { /* ignore */ }
  if (chatGens.get(key)?.gen === myGen && sitems.find((s: any) => s.sessionId === sid)?.running) {
    const brief = shownThinking ? summarizeThinking(shownThinking) : ''
    // 有 thinking 气泡才更新；没有则跳过（避免 message_id=0 无效请求）
    if (thinkingMsgId) {
      await edit(thinkingMsgId, cap((brief ? '🤔 ' + brief : '⏳ 处理中…') + '\n\n（仍在处理中，发送 /cancel 可打断）', MAX_MSG)).catch(() => {})
    }
  }
  // 轮询结束：若仍是当前代次（无新消息插入），删除该 chat 的代次键，防内存增长
  if (chatGens.get(key)?.gen === myGen) chatGens.delete(key)
}

// 创建会话：同 chat 并发去重；渠道会话用渠道配置的 workspace 目录（电报对话 → 电报工作区）
function createSessionLocked(key: string, ch: any): Promise<string> {
  const existing = sessionLocks.get(key)
  if (existing) return existing
  // 渠道配置了 workspace 路径时，解析其 workspaceId 并随创建请求传入：
  // 这样 DSH 在创建时就会把会话 attach 进对应工作区（否则新会话落入"未分组"）。
  // 用与 handleMsg 一致的解析逻辑（workspace.list → 按 path 匹配）。
  const p = (async () => {
    const cwd = ch?.workspace && ch.workspace.trim() ? ch.workspace.trim() : '/root/DSH'
    let payload: any = { cwd }
    // 尝试解析渠道工作区 id；失败/不存在则退回纯 cwd（DSH 默认放 DSH 工作区）
    try {
      const wsList = await dsh('workspace.list', {})
      const wsItems: any[] = wsList?.result?.value?.items ?? []
      const targetWs = wsItems.find((w: any) => w.path === cwd)
      if (targetWs?.workspaceId) payload = { workspaceId: targetWs.workspaceId, cwd }
    } catch { /* 忽略，退回 cwd 路径创建 */ }
    const r = await dsh('session.create', payload)
    return r?.result?.value?.sessionId as string
  })().finally(() => sessionLocks.delete(key))
  sessionLocks.set(key, p)
  return p
}

// 读插件级设置 showWorkspaceInWebui（经 DSH settings.get RPC）
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

// ── 工具调用预览：中文人类可读短语 ────────────────────────
// 动词 + 主参数摘要，不显示原始 JSON；全部用中文显示
const TOOL_VERBS: Record<string, string> = {
  // 核心文件/命令
  bash: '执行命令',
  terminal: '执行命令',
  read: '读取文件',
  read_file: '读取文件',
  write: '写入文件',
  write_file: '写入文件',
  edit: '编辑文件',
  patch: '编辑文件',
  glob: '搜索文件',
  search_files: '搜索文件',
  grep: '搜索内容',
  // Web
  web_search: '搜索网页',
  web_extract: '读取网页',
  // 多媒体
  makemake_image: '生成图片',
  image_generate: '生成图片',
  makemake_video: '生成视频',
  video_generate: '生成视频',
  read_image: '查看图片',
  looklook_see: '查看内容',
  vision_analyze: '查看',
  process_zip: '处理压缩包',
  // 目标与任务
  create_goal: '创建目标',
  get_goal: '读取目标',
  update_goal: '更新目标',
  todo_write: '更新任务列表',
  todo: '更新任务',
  // 子代理与工作流
  subagent: '委派子任务',
  subagent_fork: '委派继承子任务',
  delegate_task: '委派任务',
  workflow: '编排工作流',
  ralph: '运行 Ralph 循环',
  send_message: '发送消息',
  interrupt_agent: '中断代理',
  list_agents: '列出代理',
  // 后台任务
  job_kill: '停止任务',
  job_output: '读取任务输出',
  job_list: '列出任务',
  // 凭据与密钥
  credential_exec: '执行凭据命令',
  credential_http: '调用凭据接口',
  list_secrets: '查看密钥',
  resolve_secret: '查找密钥',
  // 技能与模式
  skill: '加载技能',
  skill_view: '读取技能',
  skills_list: '列出技能',
  skill_manage: '更新技能',
  exit_plan_mode: '退出计划模式',
  // 其他
  ask_user_question: '询问用户',
  clarify: '询问',
  memory: '更新记忆',
  cronjob: '调度任务',
  session_search: '搜索历史会话',
}
const TOOLS_NO_PREVIEW = new Set(['skills_list', 'list_secrets', 'get_goal', 'job_list', 'list_agents', 'session_search', 'exit_plan_mode'])

// 提取工具名的"人类可读预览"——从参数中取最关键的字段
function toolPreview(name: string, args: any): string {
  const a = typeof args === 'string' ? (() => { try { return JSON.parse(args) } catch { return {} } })() : (args || {})
  // 执行命令类：取命令首行
  if (name === 'bash' || name === 'terminal' || name === 'execute_code' || name === 'credential_exec') {
    const cmd = (a.command || a.code || '').trim()
    const first = cmd.split('\n')[0].trim()
    return first.length > 80 ? first.slice(0, 77) + '…' : first
  }
  // 文件类：取文件名
  if (name === 'read' || name === 'read_file' || name === 'read_image') return basename(a.file_path || a.path || a.file || a.filepath || '')
  if (name === 'write' || name === 'write_file' || name === 'edit' || name === 'patch') return basename(a.file_path || a.path || a.file || '')
  if (name === 'glob' || name === 'search_files' || name === 'grep') return a.pattern || ''
  // Web
  if (name === 'web_search') { const q = a.query || (Array.isArray(a.queries) ? a.queries[0] : ''); return typeof q === 'string' ? q : '' }
  // 多媒体
  if (name === 'makemake_image' || name === 'makemake_video') {
    const p = (a.prompt || '').trim()
    return p.length > 40 ? p.slice(0, 37) + '…' : p
  }
  if (name === 'looklook_see') return a.source ? basename(a.source) : ''
  if (name === 'process_zip') return a.path ? basename(a.path) : ''
  // 目标/任务
  if (name === 'create_goal' || name === 'ralph') return a.objective ? (a.objective as string).slice(0, 50) + ((a.objective as string).length > 50 ? '…' : '') : ''
  if (name === 'update_goal') return a.action || ''
  if (name === 'todo_write' || name === 'todo') return Array.isArray(a.todos) ? `${a.todos.length} 项任务` : ''
  // 子代理
  if (name === 'subagent' || name === 'subagent_fork' || name === 'delegate_task') {
    const p = a.prompt || a.goal || a.description || ''
    return p.length > 50 ? p.slice(0, 47) + '…' : p
  }
  if (name === 'send_message') { const m = (a.message || ''); return m.length > 40 ? m.slice(0, 37) + '…' : m }
  // 凭据
  if (name === 'resolve_secret') return a.variable || ''
  if (name === 'credential_http') return a.url || ''
  if (name === 'skill' || name === 'skill_view') return a.name || ''
  if (name === 'skill_manage') return (a.action || '') + ' ' + (a.name || '')
  if (name === 'memory') return (a.action || '') + ' ' + (a.target || '')
  if (name === 'cronjob') return a.action || ''
  if (name === 'ask_user_question' || name === 'clarify') {
    const qs = a.questions
    const q = (Array.isArray(qs) ? qs[0]?.question : a.question) || ''
    return q.length > 40 ? q.slice(0, 37) + '…' : q
  }
  // 通用回退：取 args 的第一个字符串值
  for (const v of Object.values(a)) { if (typeof v === 'string' && v.trim()) return v.slice(0, 60) + (v.length > 60 ? '…' : '') }
  return ''
}
function basename(p: string): string { return p.split('/').pop() || p }

// 生成一条工具调用的完整中文短语（动词 + 冒号 + 预览）
function toolLabel(name: string, args: any): string {
  const verb = TOOL_VERBS[name] || '使用工具'
  if (TOOLS_NO_PREVIEW.has(name)) return verb
  const preview = toolPreview(name, args)
  if (!preview) return verb
  // 压成单行：去掉换行、多个空格合并
  return (verb + '：' + preview).replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
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

// 精简摘要：只保留第一段、压缩换行、截断到 maxLen 字符
function summarizeThinking(text: string, maxLen = 150): string {
  if (!text) return ''
  // 取第一个段落（双换行分割）
  const firstPara = text.split(/\n{2,}/)[0].trim()
  // 压缩连续空白为单个空格
  const compact = firstPara.replace(/\s+/g, ' ').trim()
  if (compact.length <= maxLen) return compact
  return compact.slice(0, maxLen) + '…'
}

// 收集本回合的所有 assistant text（按出现顺序，每条独立）
// 返回 [{ key, text }] —— 中间回复和最终回复都是独立元素
// key = "turn:step"，同一个 turn 内不同的 step 是不同的回复，都要发
function collectAnswers(events: any[], minTurn = 0): Array<{ key: string; text: string }> {
  const out: Array<{ key: string; text: string }> = []
  for (const ev of events) {
    const e = ev?.event
    if (!e) continue
    const d = e.data || {}
    if (minTurn > 0 && typeof d.turn === 'number' && d.turn < minTurn) continue
    if (e.type === 'assistant/message') {
      const texts: string[] = []
      for (const b of (d.message?.content || [])) {
        if (b?.type === 'text' && b.text) texts.push(b.text)
      }
      if (texts.length) {
        const joined = texts.join('\n\n').trim()
        if (joined) {
          const turn = typeof d.turn === 'number' ? d.turn : -1
          const step = typeof d.step === 'number' ? d.step : 0
          out.push({ key: `${turn}:${step}`, text: joined })
        }
      }
    }
  }
  return out
}

// 收集回合内出现的图片附件（assistant/message content 里的 image block）
function collectMedia(events: any[], minTurn = 0): Array<{ attachmentId: string; mediaType: string; name?: string }> {
  const out: Array<{ attachmentId: string; mediaType: string; name?: string }> = []
  const seen = new Set<string>()
  for (const ev of events) {
    const e = ev?.event
    if (!e) continue
    const d = e.data || {}
    if (minTurn > 0 && typeof d.turn === 'number' && d.turn < minTurn) continue
    if (e.type === 'assistant/message' || e.type === 'tool/result') {
      const blocks = Array.isArray(d.message?.content) ? d.message.content
        : Array.isArray(d.content) ? d.content : []
      for (const b of blocks) {
        if (b?.type === 'image' && b.attachment?.attachmentId && !seen.has(b.attachment.attachmentId)) {
          seen.add(b.attachment.attachmentId)
          out.push({ attachmentId: b.attachment.attachmentId, mediaType: b.attachment.mediaType || '', name: b.attachment.name })
        }
      }
    }
  }
  return out
}

// 收集本回合回复所用的模型名（assistant/message 的 message.source.model）
function collectModel(events: any[], minTurn = 0): string {
  let model = ''
  for (const ev of events) {
    const e = ev?.event
    if (!e) continue
    const d = e.data || {}
    if (minTurn > 0 && typeof d.turn === 'number' && d.turn < minTurn) continue
    if (e.type === 'assistant/message') {
      const src = d.message?.source || {}
      if (src.kind === 'model' && src.model) model = src.model
    }
  }
  return model
}

// ── HTTP 工具 ───────────────────────────────────────────
/** Token 脱敏：只留前 5 后 3，中间打码；短 token 全打码 */
function maskToken(t: string | undefined): string {
  if (!t) return ''
  if (t.length <= 10) return '••••••'
  return `${t.slice(0, 5)}...${t.slice(-3)}`
}
/** 判断请求来源是否同源（DSH WebUI 或本机）——收紧 CORS */
function isSameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin
  if (!origin) return true // 无 Origin 头（同源导航/非浏览器）放行
  const host = req.headers.host || ''
  try {
    const o = new URL(origin)
    // 允许同 host:port 的任何协议；本机 127.0.0.1/localhost 也放行
    if (o.host === host) return true
    if (/^(127\.0\.0\.1|localhost)$/.test(o.hostname)) return true
  } catch { /* ignore */ }
  return false
}
function json(res: ServerResponse, data: any, status = 200, req?: IncomingMessage) {
  const headers: Record<string, string> = {
    'content-type': 'application/json', 'cache-control': 'no-store',
  }
  // 有 Origin 头时只对同源请求回显（浏览器跨源会被拦截）；无 Origin（非浏览器）回显 *
  if (req?.headers.origin) {
    if (isSameOrigin(req)) headers['access-control-allow-origin'] = String(req.headers.origin)
  } else {
    headers['access-control-allow-origin'] = '*'
  }
  res.writeHead(status, headers)
  res.end(JSON.stringify(data))
}
async function body(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = []; for await (const c of req) chunks.push(c as Buffer)
  return JSON.parse(Buffer.concat(chunks).toString('utf-8'))
}

const VeryIMConfig = Schema.object({
  enabled: Schema.boolean().default(true),
  showWorkspaceInWebui: Schema.boolean().default(true).description('在 WebUI 侧边栏显示渠道工作区'),
}, { additionalProperties: true })

// ── 插件入口 ────────────────────────────────────────────
// 仅声明真实用到的服务；之前的 tools/systemPrompt 未使用却是硬依赖，可能导致 apply 永不执行
export const inject = ['webServer', 'settings']
export const name = 'dsh-veryIM'

export function apply(ctx: any) {
  ctx.settings?.register(settingsNamespace('veryim'), VeryIMConfig, { base: { enabled: true } })

  // 审批自动应答者：任何审批请求直接放行（allowed-once），实现"全自动放行"
  // prepend=true 抢在 DSH 自带 WebUI 应答者之前，所有审批自动允许不弹窗
  try {
    ctx.on('approval/request', (_req: any, _next: any) => Promise.resolve('allowed-once'), true)
    console.log('[dsh-veryIM] 审批自动应答者已注册（所有审批请求自动放行）')
  } catch (e: any) {
    console.warn('[dsh-veryIM] 审批应答者注册失败: ' + e.message)
  }

  // 会话创建后：确保 approval policy 为 ask（never 会跳过应答者直接拒绝；ask 才能走到自动应答者）
  // 沙箱模式保持 danger-full-access（文件全放开），只覆盖审批策略为 ask
  try {
    ctx.on('session/created', (session: any) => {
      try {
        setApprovalPolicy(session, 'ask')
      } catch (e: any) {
        console.warn('[dsh-veryIM] 设置审批策略失败: ' + e.message)
      }
    })
    console.log('[dsh-veryIM] 会话创建钩子已注册（自动设置 approval=ask）')
  } catch (e: any) {
    console.warn('[dsh-veryIM] 会话钩子注册失败: ' + e.message)
  }

  // status：回传脱敏 botToken 供编辑表单显示（不泄露明文）+ 设置开关
  ctx.webServer.register({ kind: 'exact', path: '/plugins/dsh-veryIM/status',
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      try {
        const settings = ctx.get?.('settings') ?? ctx.settings
        const val = settings?.get?.(settingsNamespace('veryim')) ?? {}
        json(res, {
          ok: true,
          settings: { showWorkspaceInWebui: val.showWorkspaceInWebui !== false },
          channels: loadCfg().channels.map(c => ({ ...c, botToken: maskToken(c.botToken) })),
        }, 200, req)
      } catch (e: any) { json(res, { ok: false, error: e.message }, 500, req) }
    } })

  // 保存插件级 WebUI 工作区显示开关（只存设置，显示/隐藏由客户端 CSS 控制）
  ctx.webServer.register({ kind: 'exact', path: '/plugins/dsh-veryIM/webui-settings',
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      try {
        const { showWorkspaceInWebui } = await body(req)
        const svc = ctx.get?.('settings') ?? ctx.settings
        const next = !!showWorkspaceInWebui
        if (svc?.update) await svc.update(settingsNamespace('veryim'), { showWorkspaceInWebui: next })
        else if (svc?.mutate) await svc.mutate(settingsNamespace('veryim'), [{ op: 'set', path: ['showWorkspaceInWebui'], value: next }])
        json(res, { ok: true }, 200, req)
      } catch (e: any) { json(res, { ok: false, error: e.message }, 500, req) }
    } })

  // test：可用临时 proxy 校验 token
  ctx.webServer.register({ kind: 'exact', path: '/plugins/dsh-veryIM/test',
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      try {
        const { botToken, proxy } = await body(req)
        if (!botToken) { json(res, { ok: false, error: 'botToken required' }, 400, req); return }
        const disp = proxy ? (() => { try { return new ProxyAgent(proxy) } catch (e: any) { console.warn('[dsh-veryIM] test 代理不可用，回退系统代理: ' + e.message); return undefined } })() : undefined
        let me: any
        try {
          me = await tgRaw(botToken, '/getMe', {}, disp)
        } catch (e: any) {
          if (!disp) { json(res, { ok: false, error: e.cause?.message || e.message }, 400, req); return }
          // per-channel 代理网络层失败 → 回退系统代理（全局 fetch）再试一次
          try { me = await tgRaw(botToken, '/getMe', {}) }
          catch (e2: any) { json(res, { ok: false, error: e2.cause?.message || e2.message }, 400, req); return }
        }
        if (!me.ok) { json(res, { ok: false, error: me.description }, 400, req); return }
        json(res, { ok: true, id: me.result.id, username: me.result.username, name: me.result.first_name }, 200, req)
      } catch (e: any) { json(res, { ok: false, error: e.cause?.message || e.message }, 500, req) }
    } })

  // check：健康检查
  ctx.webServer.register({ kind: 'exact', path: '/plugins/dsh-veryIM/check',
    handler: async (req: IncomingMessage, res: ServerResponse) => {
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
        json(res, { ok: true, channels: results, supported: [{ type: 'telegram', name: 'Telegram', desc: 'Bot API 长轮询' }] }, 200, req)
      } catch (e: any) { json(res, { ok: false, error: e.message }, 500, req) }
    } })

  // save：编辑已有渠道时若未提供新 botToken，则沿用旧 token；更新时保留 workspace/proxy/lastUpdateId
  ctx.webServer.register({ kind: 'exact', path: '/plugins/dsh-veryIM/save',
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      try {
        const { id, botToken, name, workspace, proxy, showInWebui, allowlist } = await body(req)
        const cfg = loadCfg()
        const ex = cfg.channels.find((c: any) => c.id === id)
        const finalToken = botToken || ex?.botToken
        if (!finalToken) { json(res, { ok: false, error: 'botToken required' }, 400, req); return }
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
          showInWebui: showInWebui !== undefined ? !!showInWebui : (ex?.showInWebui !== undefined ? ex.showInWebui : false),
          allowlist: allowlist !== undefined ? allowlist : (ex?.allowlist || []),
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
          if (!me.ok) { json(res, { ok: false, error: me.description || 'Token 无效' }, 400, req); return }
          ch.botUsername = me.result.username
          ch.botId = String(me.result.id)
          ch.name = name || me.result.first_name
        }
        if (ex) Object.assign(ex, ch); else cfg.channels.push(ch)
        saveCfg(cfg); dispatchers.delete(ch.id); stopPoll(ch.id); startPoll(ch)
        json(res, { ok: true, channel: { ...ch, botToken: maskToken(ch.botToken) } }, 200, req)
      } catch (e: any) { json(res, { ok: false, error: e.cause?.message || e.message }, 500, req) }
    } })

  // delete
  ctx.webServer.register({ kind: 'exact', path: '/plugins/dsh-veryIM/delete',
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      try {
        const { id } = await body(req)
        const cfg = loadCfg()
        cfg.channels = cfg.channels.filter((c: any) => c.id !== id)
        saveCfg(cfg); stopPoll(id); dispatchers.delete(id)
        json(res, { ok: true }, 200, req)
      } catch (e: any) { json(res, { ok: false, error: e.message }, 500, req) }
    } })

  const cfg = loadCfg()
  for (const ch of cfg.channels) { if (ch.enabled) startPoll(ch) }
  console.log(`[dsh-veryIM] 插件已加载，${cfg.channels.length} 个渠道`)
}

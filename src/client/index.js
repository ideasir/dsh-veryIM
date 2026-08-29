/** dsh-veryIM 客户端 — 纯 JS，弹窗用 innerHTML，卡片用 React */
const VERSION = '0828-0.2.0'
const REPO = 'https://github.com/ideasir/dsh-veryIM'

const CSS = `
.dsh-vm-overlay{position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;animation:vmfade .2s}
.dsh-vm-modal{background:var(--dsw-alias-bg-layer-2,#1c1c1e);border:1px solid var(--dsw-alias-border-l2,#333);border-radius:16px;width:520px;max-width:92vw;max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.5)}
.dsh-vm-mh{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--dsw-alias-border-l2)}
.dsh-vm-mt{font-size:15px;font-weight:600;color:var(--dsw-alias-label-primary)}
.dsh-vm-mx{width:28px;height:28px;border:0;background:none;cursor:pointer;color:var(--dsw-alias-label-tertiary);border-radius:6px;display:flex;align-items:center;justify-content:center}
.dsh-vm-mx:hover{background:var(--dsw-alias-bg-layer-1)}
.dsh-vm-mb{padding:16px;display:flex;flex-direction:column;gap:12px}
.dsh-vm-mf label{display:block;font-size:12px;color:var(--dsw-alias-label-tertiary);margin-bottom:4px}
.dsh-vm-mf input{width:100%;padding:8px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:13px;box-sizing:border-box}
.dsh-vm-mf input:focus{outline:none;border-color:var(--dsw-alias-brand-primary,#4c78ff)}
.dsh-vm-mf small{font-size:11px;color:var(--dsw-alias-label-tertiary)}
.dsh-vm-mft{padding:12px 16px;border-top:1px solid var(--dsw-alias-border-l2);display:flex;justify-content:flex-end;gap:8px}
.dsh-vm-modal button.dsh-vm-b{padding:7px 16px !important;border:1px solid var(--dsw-alias-border-l2,#333) !important;border-radius:8px !important;background:var(--dsw-alias-bg-layer-1,#2c2c2e) !important;color:var(--dsw-alias-label-primary,#f9fafb) !important;font-size:13px !important;line-height:1.4 !important;cursor:pointer !important;appearance:none;font-family:inherit}
.dsh-vm-modal button.dsh-vm-b:not(.dsh-vm-bp):hover{background:var(--dsw-alias-bg-layer-2,#3a3a3c) !important}
.dsh-vm-modal button.dsh-vm-bp{background:var(--dsw-alias-button-primary-fill,var(--dsw-alias-brand-primary,#4c78ff)) !important;color:var(--dsw-alias-label-primary-inverted,#fff) !important;border-color:transparent !important}
.dsh-vm-modal button.dsh-vm-bp:hover{filter:brightness(1.08)}
.dsh-vm-fb{font-size:12px;padding:8px 12px;border-radius:8px;margin-top:4px}
.dsh-vm-fb-ok{background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#22c55e) 10%,transparent);color:var(--dsw-alias-state-success-primary,#22c55e)}
.dsh-vm-fb-er{background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#ef4444) 10%,transparent);color:var(--dsw-alias-state-error-primary,#ef4444)}
.dsh-vm-cl{display:flex;flex-direction:column;gap:6px}
.dsh-vm-co{display:flex;align-items:center;gap:10px;padding:12px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;cursor:pointer;transition:all .15s}
.dsh-vm-co:hover{border-color:var(--dsw-alias-brand-primary,#4c78ff)}
.dsh-vm-ci{width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center}
.dsh-vm-ct{flex:1}
.dsh-vm-cn{font-size:14px;font-weight:500;color:var(--dsw-alias-label-primary)}
.dsh-vm-cd{font-size:12px;color:var(--dsw-alias-label-tertiary)}
.dsh-vm-chs{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}
.dsh-vm-ch{display:flex;align-items:center;gap:6px;padding:8px 14px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-2);cursor:pointer;transition:border-color .15s}
.dsh-vm-ch:hover{border-color:var(--dsw-alias-brand-primary,#4c78ff)}
.dsh-vm-dot{width:8px;height:8px;border-radius:50%}
.dsh-vm-dot.on{background:var(--dsw-alias-state-success-primary,#22c55e);box-shadow:0 0 6px var(--dsw-alias-state-success-primary,#22c55e)}
@keyframes vmfade{from{opacity:0}to{opacity:1}}
.dsh-vm-ck{display:flex;flex-direction:column;gap:8px}
.dsh-vm-ck-row{display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:8px;background:var(--dsw-alias-bg-layer-1)}
.dsh-vm-ck-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.dsh-vm-ck-ok .dsh-vm-ck-dot{background:var(--dsw-alias-state-success-primary,#22c55e)}
.dsh-vm-ck-er .dsh-vm-ck-dot{background:var(--dsw-alias-state-error-primary,#ef4444)}
.dsh-vm-ck-name{font-size:13px;color:var(--dsw-alias-label-primary);flex:1}
.dsh-vm-ck-ms{font-size:11px;color:var(--dsw-alias-label-tertiary)}
.dsh-vm-section{font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary);margin-bottom:8px}
.dsh-vm-big{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:10px 0;border-radius:10px;border:none;background:var(--dsw-alias-button-primary-fill,var(--dsw-alias-brand-primary));color:var(--dsw-alias-label-primary-inverted,#fff);cursor:pointer;font-size:13px;font-weight:600;transition:filter .12s}
.dsh-vm-big:hover{filter:brightness(1.1)}
`

const CloseSvg = '<svg viewBox="0 0 24 24" fill="none" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
const PlusSvg = '<svg viewBox="0 0 24 24" fill="none" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
const ChatSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>'
const TgSvg = '<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>'

// ── fetch 工具 ──
function api(path, body) {
  const o = window.location.origin
  return fetch(`${o}/plugins/dsh-veryIM${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }).then(r => r.json())
}

// ── 弹窗管理（innerHTML，跟 passpass 密码本弹窗一致） ──
let _channels = []
let _modal = null // 'pick' | 'cfg' | 'check'
let _modalStack = [] // 弹窗历史栈，支持 ESC 退回上一层
let _edit = null
let _token = '', _proxy = '', _ws = '', _wl = '', _fb = null, _check = null, _saving = false
let _showWs = true          // 插件级：WebUI 显示渠道工作区
let _showChWs = true        // 渠道级：本渠道在 WebUI 显示工作区
let _render = null // 卡片刷新回调

function esc(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') }

async function refreshChannels() {
  try { const r = await api('/status'); if (r && r.ok) { _channels = r.channels || []; if (r.settings) _showWs = r.settings.showWorkspaceInWebui !== false } } catch (e) {}
}

function openModal(kind, ch) {
  // 把当前弹窗状态压栈（支持 goBack 回退）
  if (_modal) {
    _modalStack.push({ modal: _modal, edit: _edit, token: _token, proxy: _proxy, ws: _ws, wl: _wl, fb: _fb, check: _check })
  }
  _modal = kind
  if (kind === 'cfg') {
    _edit = ch || null
    _token = ch ? (ch.botToken || '') : ''
    _proxy = ch ? (ch.proxy || '') : ''
    _ws = ch ? (ch.workspace || '') : ''
    _wl = ch ? (Array.isArray(ch.allowlist) ? ch.allowlist.join(', ') : '') : ''
    _showChWs = ch ? (ch.showInWebui !== false) : true
    _fb = null
  }
  if (kind === 'check') { _check = null; runCheck() }
  renderModal()
}

function closeModal() { _modal = null; _modalStack = []; _edit = null; _fb = null; _check = null; renderModal() }

function goBack() {
  if (_modalStack.length === 0) { closeModal(); return }
  const prev = _modalStack.pop()
  _modal = prev.modal; _edit = prev.edit; _token = prev.token
  _proxy = prev.proxy; _ws = prev.ws; _wl = prev.wl || ''; _fb = prev.fb; _check = prev.check
  renderModal()
}

function renderModal() {
  const existing = document.getElementById('dsh-vm-root')
  if (existing) existing.remove()
  if (!_modal) return

  const root = document.createElement('div')
  root.id = 'dsh-vm-root'
  root.innerHTML = modalHtml()
  document.body.appendChild(root)
  bindModal(root)
}

function modalHtml() {
  if (_modal === 'pick') {
    return `<div class="dsh-vm-overlay" data-vm-close>
      <div class="dsh-vm-modal">
        <div class="dsh-vm-mh"><span class="dsh-vm-mt">选择渠道</span>
          <button class="dsh-vm-mx" data-vm-action="close">${CloseSvg}</button></div>
        <div class="dsh-vm-mb"><div class="dsh-vm-cl">
          <div class="dsh-vm-co" data-vm-action="pick-telegram">
            <div class="dsh-vm-ci">${TgSvg}</div>
            <div class="dsh-vm-ct"><div class="dsh-vm-cn">Telegram</div><div class="dsh-vm-cd">通过 Bot API 接入 Telegram 机器人</div></div>
          </div>
        </div></div>
      </div>
    </div>`
  }

  if (_modal === 'cfg') {
    const title = _edit ? '编辑 Telegram 渠道' : '接入 Telegram'
    const fbHtml = _fb ? `<div class="dsh-vm-fb dsh-vm-fb-${_fb.t}">${esc(_fb.m)}</div>` : ''
    return `<div class="dsh-vm-overlay" data-vm-close>
      <div class="dsh-vm-modal">
        <div class="dsh-vm-mh"><span class="dsh-vm-mt">${title}</span>
          <button class="dsh-vm-mx" data-vm-action="close">${CloseSvg}</button></div>
        <div class="dsh-vm-mb">
          <div class="dsh-vm-mf">
            <label>Bot Token</label>
            <input data-vm-token type="text" placeholder="从 @BotFather 获取" value="${esc(_token)}" />
            <small>在 Telegram 搜索 @BotFather，发送 /newbot 创建</small>
          </div>
          <div class="dsh-vm-mf">
            <label>代理服务器</label>
            <input data-vm-proxy type="text" placeholder="http://127.0.0.1:1080 或 https://proxy:8080" value="${esc(_proxy)}" />
            <small>可选。支持 http/https 代理；socks5 请用系统 HTTPS_PROXY 环境变量</small>
          </div>
          <div class="dsh-vm-mf">
            <label>工作区路径</label>
            <input data-vm-ws type="text" placeholder="/vol1/1000/DeepSeek/telegram" value="${esc(_ws)}" />
            <small>可选。留空使用 DSH 默认工作区</small>
          </div>
          <div class="dsh-vm-mf">
            <label>用户白名单</label>
            <input data-vm-wl type="text" placeholder="例如：8734867823, 12345678（数字 user id，逗号分隔）" value="${esc(_wl)}" />
            <small>可选。留空=不限（任何人可用）；填写后仅名单内用户能对话</small>
          </div>
          <div class="dsh-vm-mf">
            <label>在 WebUI 显示工作区</label>
            <button data-vm-action="toggle-ch-ws" type="button" style="width:38px;height:20px;border-radius:10px;border:none;cursor:pointer;position:relative;background:${_showChWs ? 'var(--dsw-alias-state-success-primary,#22c55e)' : 'rgba(255,255,255,0.15)'};transition:background .2s">
              <span style="position:absolute;top:2px;width:16px;height:16px;border-radius:50%;background:#fff;left:${_showChWs ? 20 : 2}px;transition:left .2s"></span>
            </button>
            <small>关闭后，本渠道的工作区不在 WebUI 侧边栏显示</small>
          </div>
          <div style="display:flex;gap:8px">
            <button class="dsh-vm-b" data-vm-action="test" style="padding:7px 16px;border:1px solid var(--dsw-alias-border-l2,#4b4b4f);border-radius:8px;background:var(--dsw-alias-bg-layer-1,#2c2c2e);color:var(--dsw-alias-label-primary,#f9fafb);font-size:13px;line-height:1.4;cursor:pointer">验证 Token</button>
          </div>
          ${fbHtml}
        </div>
        <div class="dsh-vm-mft">
          <button class="dsh-vm-b" data-vm-action="back" style="padding:7px 16px;border:1px solid var(--dsw-alias-border-l2,#4b4b4f);border-radius:8px;background:var(--dsw-alias-bg-layer-1,#2c2c2e);color:var(--dsw-alias-label-primary,#f9fafb);font-size:13px;line-height:1.4;cursor:pointer">取消</button>
          <button class="dsh-vm-b dsh-vm-bp" data-vm-action="save" ${_saving ? 'disabled' : ''} style="padding:7px 16px;border:1px solid transparent;border-radius:8px;background:var(--dsw-alias-button-primary-fill,#4c78ff);color:#fff;font-size:13px;line-height:1.4;cursor:pointer">${_saving ? '保存中...' : '保存并连接'}</button>
        </div>
      </div>
    </div>`
  }

  if (_modal === 'check') {
    let chList = '<div style="font-size:12px;color:var(--dsw-alias-label-tertiary)">检测中...</div>'
    if (_check) {
      if (_check.ok && _check.channels) {
        chList = `<div class="dsh-vm-ck">` + _check.channels.map(ch => `
          <div class="dsh-vm-ck-row ${ch.healthy ? 'dsh-vm-ck-ok' : 'dsh-vm-ck-er'}">
            <span class="dsh-vm-ck-dot"></span>
            <span class="dsh-vm-ck-name">${esc(ch.name)} (@${esc(ch.username)})</span>
            <span class="dsh-vm-ck-ms">${ch.healthy ? ch.latencyMs + 'ms' : esc(ch.error || '不可达')}</span>
          </div>`).join('') + `</div>`
      } else {
        chList = '<div style="font-size:12px;color:var(--dsw-alias-label-tertiary)">暂无渠道</div>'
      }
    }
    return `<div class="dsh-vm-overlay" data-vm-close>
      <div class="dsh-vm-modal">
        <div class="dsh-vm-mh"><span class="dsh-vm-mt">智能检测</span>
          <button class="dsh-vm-mx" data-vm-action="close">${CloseSvg}</button></div>
        <div class="dsh-vm-mb">
          <div><div class="dsh-vm-section">已添加渠道</div>${chList}</div>
          <div style="margin-top:16px">
            <div class="dsh-vm-section">支持的渠道</div>
            <div class="dsh-vm-ck">
              <div class="dsh-vm-ck-row dsh-vm-ck-ok"><span class="dsh-vm-ck-dot"></span>${TgSvg}<span class="dsh-vm-ck-name">Telegram</span><span class="dsh-vm-ck-ms">Bot API 长轮询</span></div>
            </div>
          </div>
          <button class="dsh-vm-b" data-vm-action="recheck" style="margin-top:8px">重新检测</button>
        </div>
      </div>
    </div>`
  }
  return ''
}

function bindModal(root) {
  // 点击遮罩退回上一层（无栈时全部关闭）
  const overlay = root.querySelector('.dsh-vm-overlay')
  if (overlay) overlay.addEventListener('click', (e) => { if (e.target === overlay) goBack() })

  // action 按钮
  root.querySelectorAll('[data-vm-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const a = btn.getAttribute('data-vm-action')
      if (a === 'close') closeModal()
      if (a === 'back') goBack()
      if (a === 'pick-telegram') openModal('cfg', null)
      if (a === 'test') doTest()
      if (a === 'save') doSave()
      if (a === 'recheck') runCheck()
      if (a === 'toggle-ch-ws') {
        _showChWs = !_showChWs
        renderModal()
        // 保存渠道级开关到服务端，刷新渠道配置后应用隐藏
        if (_edit && _edit.id) {
          const data = { showInWebui: _showChWs, id: _edit.id }
          api('/save', data).then(async () => {
            try { await refreshChannels() } catch (e) {}
            hideChannelWorkspaces()
          })
        } else {
          hideChannelWorkspaces()
        }
      }
    })
  })

  // 输入变化
  const t = root.querySelector('[data-vm-token]'); if (t) t.addEventListener('input', e => _token = e.target.value)
  const p = root.querySelector('[data-vm-proxy]'); if (p) p.addEventListener('input', e => _proxy = e.target.value)
  const w = root.querySelector('[data-vm-ws]'); if (w) w.addEventListener('input', e => _ws = e.target.value)
  const wl = root.querySelector('[data-vm-wl]'); if (wl) wl.addEventListener('input', e => _wl = e.target.value)
}

// ESC 键：输入框内先 blur，否则退回上一层弹窗
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && _modal) {
    const tag = document.activeElement?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') { document.activeElement.blur(); return }
    e.preventDefault(); goBack()
  }
})

async function doTest() {
  _fb = null; renderModal()
  if (!_token) { _fb = { t: 'er', m: '❌ 请先填写 Bot Token' }; renderModal(); return }
  try {
    const r = await api('/test', { botToken: _token, proxy: _proxy || undefined })
    if (r && r.ok) { _fb = { t: 'ok', m: `✅ @${r.username} (${r.name})` } }
    else {
      const msg = (r && r.error != null) ? String(r.error) : (r ? 'Token 无效' : '请求失败，请检查服务是否可用')
      _fb = { t: 'er', m: `❌ ${msg}` }
    }
  } catch (e) { _fb = { t: 'er', m: `❌ ${(e && e.message) ? e.message : '请求异常'}` } }
  renderModal()
}

async function doSave() {
  _saving = true; renderModal()
  try {
    const wlArr = _wl.split(/[,，\s]+/).map(s => s.trim()).filter(Boolean).map(Number).filter(n => Number.isFinite(n))
    const r = await api('/save', { botToken: _token, proxy: _proxy || undefined, workspace: _ws || undefined, showInWebui: _showChWs, allowlist: wlArr, ...(_edit && _edit.id ? { id: _edit.id } : {}) })
    if (r && r.ok) {
      _fb = { t: 'ok', m: '✅ 已保存并连接' }
      await refreshChannels()
      if (_render) _render()
      setTimeout(() => closeModal(), 1200)
    } else {
      const msg = (r && r.error != null) ? String(r.error) : (r ? '保存失败' : '请求失败，请检查服务是否可用')
      _fb = { t: 'er', m: `❌ ${msg}` }
    }
  } catch (e) { _fb = { t: 'er', m: `❌ ${(e && e.message) ? e.message : '请求异常'}` } }
  _saving = false; renderModal()
}

async function runCheck() {
  _check = null; renderModal()
  try { const r = await api('/check'); if (r) _check = r } catch (e) { _check = { ok: false, error: e.message } }
  renderModal()
}

async function delChannel(id) {
  if (!confirm('确定删除此渠道？')) return
  await api('/delete', { id }); await refreshChannels()
  if (_render) _render()
}

// ── React 卡片（只有头部和渠道标签用 React，避免深嵌套） ──
export const inject = ['slots']

export function apply(ctx) {
  // 注入弹窗 CSS
  if (!document.getElementById('dsh-vm-css')) {
    const s = document.createElement('style'); s.id = 'dsh-vm-css'; s.textContent = CSS
    document.head.appendChild(s)
  }

  // ── WebUI 工作区显示控制（CSS 隐藏/显示，不碰任何数据） ──
  // 渠道工作区按渠道名隐藏：关闭开关 → 侧边栏工作区 display:none；开启 → 恢复
  const WS_HIDE_CLASS = 'dsh-vm-ws-hidden'
  if (!document.getElementById('dsh-vm-ws-css')) {
    const s = document.createElement('style'); s.id = 'dsh-vm-ws-css'
    s.textContent = `.dsh-vm-ws-hidden{display:none!important}`
    document.head.appendChild(s)
  }

  // 找到渠道工作区元素：按渠道名 + 渠道 workspace 路径末段（如 telegram）匹配侧边栏工作区行
  // 逻辑：渠道 showInWebui 开 → 显示；关 → 隐藏（整个工作区块）
  function hideChannelWorkspaces() {
    if (!_channels || _channels.length === 0) return
    // 每个渠道 → 是否应显示
    const showMap = new Map()  // 工作区名 → 是否显示
    _channels.forEach(c => {
      const visible = c.showInWebui !== false
      const n = (c.botUsername || c.name || '').trim()
      if (n) showMap.set(n, visible)
      const ws = (c.workspace || '').trim()
      if (ws) showMap.set(ws.split('/').filter(Boolean).pop(), visible)
    })
    if (showMap.size === 0) return
    const rows = document.querySelectorAll('[class*="projectRow"],[class*="project-row"]')
    rows.forEach(row => {
      const text = (row.textContent || '').trim()
      for (const [name, visible] of showMap) {
        if (text === name || text.includes(name)) {
          // 隐藏整个工作区段（标题 + 所有会话）：向上找到 groupSection 容器
          let block = row.parentElement
          // 向上找 qDHVXG_groupSection（工作区整段容器，含标题和所有会话）
          let section = row
          for (let i = 0; i < 4; i++) {
            section = section.parentElement
            if (!section) break
            if (/groupSection|group-section/.test(section.className)) break
          }
          const target = section && /groupSection|group-section/.test(section.className) ? section : block
          if (visible) target.classList.remove(WS_HIDE_CLASS)
          else target.classList.add(WS_HIDE_CLASS)
          break
        }
      }
    })
  }

  // 监听侧边栏变化（工作区渲染后立即应用隐藏）
  let wsTimer = null
  function scheduleWsHide() {
    if (wsTimer) clearTimeout(wsTimer)
    wsTimer = setTimeout(() => {
      hideChannelWorkspaces()
    }, 150)
  }
  const wsObserver = new MutationObserver(() => scheduleWsHide())
  // 启动：先拉渠道配置（填 _channels/_showWs），再观察侧边栏
  setTimeout(async () => {
    try { await refreshChannels() } catch (e) {}
    const sb = document.querySelector('[class*="workspaces"]') || document.body
    wsObserver.observe(sb, { childList: true, subtree: true })
    scheduleWsHide()
    // 持续重试几次（侧边栏可能延迟渲染）
    for (let i = 0; i < 5; i++) { setTimeout(scheduleWsHide, (i + 1) * 1000) }
  }, 800)

  function VeryIMPluginCard() {
    const R = window.React || require('react')
    const [open, setOpen] = R.useState(false)
    const [chans, setChans] = R.useState([])
    const [tick, setTick] = R.useState(0)

    // 外部操作完成后同步模块数据到 React state，再触发渲染
    _render = () => {
      setChans([..._channels])
      setTick(t => t + 1)
    }

    // 卸载时清空外部刷新回调，避免对已卸载组件 setState
    R.useEffect(() => { return () => { _render = null } }, [])

    const refresh = async () => { await refreshChannels(); setChans([..._channels]) }
    const toggle = async () => { const nv = !open; setOpen(nv); if (nv) await refresh() }

    // 卡片头部
    const head = R.createElement('button', { className: 'dsh-mm-head', onClick: toggle },
      R.createElement('span', { className: 'dsh-mm-head-text' },
        R.createElement('div', { className: 'dsh-mm-name-row' },
          R.createElement('span', { className: 'dsh-mm-title', style: { display: 'inline-flex', alignItems: 'center', gap: 6 } },
            R.createElement('span', { dangerouslySetInnerHTML: { __html: ChatSvg } }), 'Very IM'),
          R.createElement('span', { className: 'dsh-mm-version-badge' }, VERSION)),
        R.createElement('span', { className: 'dsh-mm-desc' }, '接入即时通讯渠道，让 AI 通过 Telegram 与你对话。')),
      R.createElement('span', { className: 'dsh-mm-btns' },
        R.createElement('a', { className: 'dsh-mm-btn-link', href: REPO, target: '_blank', rel: 'noreferrer', onClick: (e) => e.stopPropagation() }, 'ideasir'),
        R.createElement('button', { className: 'dsh-mm-btn-uninstall', onClick: (e) => { e.stopPropagation() } }, '卸载'),
        R.createElement('button', { className: 'dsh-mm-btn-update', style: { color: 'var(--dsw-alias-label-tertiary)' }, onClick: (e) => e.stopPropagation() }, '已最新'),
        R.createElement('button', { className: 'dsh-mm-btn-update', onClick: (e) => { e.stopPropagation(); openModal('check') } }, '智能检测'),
        R.createElement('span', { className: 'dsh-mm-chevron' + (open ? ' dsh-mm-chevron-open' : '') },
          R.createElement('svg', { viewBox: '0 0 14 14', fill: 'none', width: 14, height: 14 },
            R.createElement('path', { d: 'M3.5 5.25L7 8.75L10.5 5.25', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' })))))

    // 展开内容：渠道标签 + 添加按钮（用 DOM 渲染避免深嵌套）
    let body = null
    if (open) {
      // 用字符串构建渠道标签 + 按钮
      const channelsHtml = chans.length > 0
        ? `<div class="dsh-vm-chs">` + chans.map(ch => `
            <div class="dsh-vm-ch" data-ch-id="${esc(ch.id)}">
              <span class="dsh-vm-dot on"></span>${TgSvg}
              <span style="font-size:13px;color:var(--dsw-alias-label-primary,#f9fafb)">@${esc(ch.botUsername || ch.name)}</span>
              ${ch.proxy ? '<span style="font-size:11px;color:var(--dsw-alias-label-tertiary,#999);background:var(--dsw-alias-bg-layer-1);border-radius:4px;padding:1px 6px">代理</span>' : ''}
              ${ch.workspace ? '<span title="' + esc(ch.workspace) + '" style="font-size:11px;color:var(--dsw-alias-label-tertiary,#999);background:var(--dsw-alias-bg-layer-1);border-radius:4px;padding:1px 6px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">📁 ' + esc(ch.workspace) + '</span>' : ''}
              <span class="dsh-vm-ch-del" data-del-id="${esc(ch.id)}" style="cursor:pointer;color:var(--dsw-alias-label-tertiary,#999);margin-left:4px">✕</span>
            </div>`).join('') + `</div>`
        : ''
      const btn = `<button class="dsh-vm-big" data-vm-open-add style="margin-top:0"><span>${PlusSvg}</span>添加渠道</button>`

            // 用 ref 挂载 DOM
            return R.createElement('li', { className: 'dsh-mm-card' }, head,
              R.createElement('div', { className: 'dsh-mm-body' },
                R.createElement('div', { ref: (el) => {
                  if (!el) return
                  el.innerHTML = channelsHtml + btn
                  // 绑定事件
                  el.querySelectorAll('[data-ch-id]').forEach(c => {
                    c.addEventListener('click', () => {
                      const id = c.getAttribute('data-ch-id')
                      const ch = chans.find(x => x.id === id)
                      if (ch) openModal('cfg', ch)
                    })
                  })
                  el.querySelectorAll('[data-del-id]').forEach(c => {
                    c.addEventListener('click', (e) => { e.stopPropagation(); delChannel(c.getAttribute('data-del-id')) })
                  })
                  el.querySelector('[data-vm-open-add]').addEventListener('click', () => openModal('pick'))
                } })
              ))
    }

    return R.createElement('li', { className: 'dsh-mm-card' }, head, body)
  }

  ctx.slots.inject('settings.plugin.item', () => {
    const register = ctx.slots.register.bind(ctx.slots)
    return register({ name: 'settings.plugin.item', key: 'veryim', priority: 50, inject: () => ({}) }, VeryIMPluginCard)
  })
}

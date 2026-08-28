/** dsh-veryIM 客户端 v2 — 完整 UI：卡片对齐 + 代理/工作区 + 智能检测 + 大按钮 */
const VERSION = '0828-0.1.1'
const REPO = 'https://github.com/ideasir/dsh-veryIM'

// ── 弹窗 CSS ──
const CSS = `
.dsh-vm-overlay{position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;animation:vmfade .2s}
.dsh-vm-modal{background:var(--dsw-alias-bg-layer-2,#1c1c1e);border:1px solid var(--dsw-alias-border-l2,#333);border-radius:16px;width:520px;max-width:92vw;max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.5)}
.dsh-vm-mh{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--dsw-alias-border-l2)}
.dsh-vm-mt{font-size:15px;font-weight:600;color:var(--dsw-alias-label-primary)}
.dsh-vm-mx{width:28px;height:28px;border:0;background:none;cursor:pointer;color:var(--dsw-alias-label-tertiary);border-radius:6px;display:flex;align-items:center;justify-content:center}
.dsh-vm-mx:hover{background:var(--dsw-alias-bg-layer-1)}
.dsh-vm-mb{padding:16px;display:flex;flex-direction:column;gap:12px}
.dsh-vm-mf label{display:block;font-size:12px;color:var(--dsw-alias-label-tertiary);margin-bottom:4px}
.dsh-vm-mf input,.dsh-vm-mf select{width:100%;padding:8px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:13px;box-sizing:border-box}
.dsh-vm-mf input:focus,.dsh-vm-mf select:focus{outline:none;border-color:var(--dsw-alias-brand-primary,#4c78ff)}
.dsh-vm-mf small{font-size:11px;color:var(--dsw-alias-label-tertiary)}
.dsh-vm-mft{padding:12px 16px;border-top:1px solid var(--dsw-alias-border-l2);display:flex;justify-content:flex-end;gap:8px}
.dsh-vm-b{padding:7px 16px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:13px;cursor:pointer}
.dsh-vm-b:hover{background:var(--dsw-alias-bg-layer-2)}
.dsh-vm-bp{background:var(--dsw-alias-brand-primary,#4c78ff);color:#fff;border-color:transparent}
.dsh-vm-bp:hover{opacity:.9}
.dsh-vm-fb{font-size:12px;padding:8px 12px;border-radius:8px}
.dsh-vm-fb-ok{background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#22c55e) 10%,transparent);color:var(--dsw-alias-state-success-primary,#22c55e)}
.dsh-vm-fb-er{background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#ef4444) 10%,transparent);color:var(--dsw-alias-state-error-primary,#ef4444)}
.dsh-vm-cl{display:flex;flex-direction:column;gap:6px}
.dsh-vm-co{display:flex;align-items:center;gap:10px;padding:12px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;cursor:pointer;transition:all .15s}
.dsh-vm-co:hover{border-color:var(--dsw-alias-brand-primary,#4c78ff);background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4c78ff) 4%,#fff)}
.dsh-vm-ci{width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center}
.dsh-vm-ct{flex:1}
.dsh-vm-cn{font-size:14px;font-weight:500;color:var(--dsw-alias-label-primary)}
.dsh-vm-cd{font-size:12px;color:var(--dsw-alias-label-tertiary)}
/* 渠道标签 */
.dsh-vm-chs{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}
.dsh-vm-ch{display:flex;align-items:center;gap:6px;padding:8px 14px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-2);cursor:pointer;transition:border-color .15s}
.dsh-vm-ch:hover{border-color:var(--dsw-alias-brand-primary,#4c78ff)}
.dsh-vm-dot{width:8px;height:8px;border-radius:50%}
.dsh-vm-dot.on{background:var(--dsw-alias-state-success-primary,#22c55e);box-shadow:0 0 6px var(--dsw-alias-state-success-primary,#22c55e)}
.dsh-vm-dot.off{background:var(--dsw-alias-state-error-primary,#ef4444)}
@keyframes vmfade{from{opacity:0}to{opacity:1}}
/* 检测结果 */
.dsh-vm-ck{display:flex;flex-direction:column;gap:8px}
.dsh-vm-ck-row{display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:8px;background:var(--dsw-alias-bg-layer-1)}
.dsh-vm-ck-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.dsh-vm-ck-ok .dsh-vm-ck-dot{background:var(--dsw-alias-state-success-primary,#22c55e);box-shadow:0 0 4px var(--dsw-alias-state-success-primary,#22c55e)}
.dsh-vm-ck-er .dsh-vm-ck-dot{background:var(--dsw-alias-state-error-primary,#ef4444)}
.dsh-vm-ck-name{font-size:13px;color:var(--dsw-alias-label-primary);flex:1}
.dsh-vm-ck-ms{font-size:11px;color:var(--dsw-alias-label-tertiary)}
`

// ── SVG ──
const CloseSvg = '<svg viewBox="0 0 18 18" fill="none" width="18" height="18"><line x1="5" y1="5" x2="13" y2="13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="13" y1="5" x2="5" y2="13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>'
const PlusSvg = '<svg viewBox="0 0 16 16" fill="none" width="14" height="14"><line x1="8" y1="3" x2="8" y2="13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="3" y1="8" x2="13" y2="8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>'
const TrashSvg = '<svg viewBox="0 0 24 24" fill="none" width="14" height="14"><polyline points="3 6 5 6 21 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
const ChatSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>'
const TgSvg = '<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>'
const ScanSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>'
const ChevronSvg = '<svg viewBox="0 0 14 14" fill="none" width="14" height="14"><path d="M3.5 5.25L7 8.75L10.5 5.25" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'

// ── fetch 工具 ──
function api(path, body) {
  const o = window.location.origin
  return fetch(`${o}/plugins/dsh-veryIM${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }).then(r => r.json())
}

// ── 模块导出 ──
export const inject = ['slots'] as const

export function apply(ctx) {
  // 注入弹窗 CSS
  if (!document.getElementById('dsh-vm-css')) {
    const s = document.createElement('style'); s.id = 'dsh-vm-css'; s.textContent = CSS
    document.head.appendChild(s)
  }

  // ── VeryIMPluginCard（与 passpass/makemake 完全对齐） ──
  function VeryIMPluginCard() {
    const R = (window as any).React
    const [open, setOpen] = R.useState(false)
    const [chans, setChans] = R.useState([])
    const [modal, setModal] = R.useState<string | null>(null) // 'pick-type' | 'cfg-telegram' | 'check' | null
    const [editing, setEditing] = R.useState(null)
    const [token, setToken] = R.useState('')
    const [proxy, setProxy] = R.useState('')
    const [workspace, setWorkspace] = R.useState('')
    const [botInfo, setBotInfo] = R.useState(null)
    const [fb, setFb] = R.useState(null)
    const [saving, setSaving] = R.useState(false)
    const [checkResult, setCheckResult] = R.useState(null)
    const [checking, setChecking] = R.useState(false)

    const refresh = async () => { try { const r = await api('/status'); if (r?.ok) setChans(r.channels || []) } catch {} }

    const toggle = async () => { setOpen(v => !v); if (!open) await refresh() }

    const testToken = async () => {
      if (!token.trim()) return; setFb(null); setBotInfo(null)
      try {
        const r = await api('/test', { botToken: token.trim(), proxy: proxy || undefined })
        if (r?.ok) { setBotInfo(r); setFb({ t: 'ok', m: `✅ @${r.username} (${r.name})` }) }
        else setFb({ t: 'er', m: `❌ ${r.error || 'Token 无效'}` })
      } catch (e) { setFb({ t: 'er', m: `❌ ${e.message}` }) }
    }

    const saveChannel = async () => {
      if (!token.trim()) return; setSaving(true)
      try {
        const r = await api('/save', { botToken: token.trim(), proxy: proxy || undefined, workspace: workspace || undefined, ...(editing?.id ? { id: editing.id } : {}) })
        if (r?.ok) {
          setFb({ t: 'ok', m: '✅ 已保存并连接' }); await refresh()
          setTimeout(() => { setModal(null); setEditing(null); setToken(''); setProxy(''); setWorkspace(''); setBotInfo(null); setFb(null) }, 1200)
        } else setFb({ t: 'er', m: `❌ ${r.error || '保存失败'}` })
      } catch (e) { setFb({ t: 'er', m: `❌ ${e.message}` }) }
      finally { setSaving(false) }
    }

    const delChannel = async (id) => {
      if (!confirm('确定删除此渠道？')) return
      await api('/delete', { id }); await refresh()
    }

    const openCfg = (ch) => {
      setEditing(ch); setToken(ch.botToken || ''); setProxy(ch.proxy || ''); setWorkspace(ch.workspace || '')
      setBotInfo({ username: ch.botUsername, name: ch.name }); setModal('cfg-telegram'); setFb(null)
    }

    const runCheck = async () => {
      setChecking(true); setCheckResult(null)
      try {
        const r = await api('/check'); if (r?.ok) setCheckResult(r)
      } catch (e) { setCheckResult({ ok: false, error: e.message }) }
      finally { setChecking(false) }
    }

    // ── 卡片头部（与 passpass 一模一样） ──
    const Card = R.createElement('li', { className: 'dsh-mm-card' },
      R.createElement('button', { className: 'dsh-mm-head', onClick: toggle },
        R.createElement('span', { className: 'dsh-mm-head-text' },
          R.createElement('div', { className: 'dsh-mm-name-row' },
            R.createElement('span', { className: 'dsh-mm-title', style: { display: 'inline-flex', alignItems: 'center', gap: 6 } },
              R.createElement('span', { dangerouslySetInnerHTML: { __html: ChatSvg } }), 'Very IM'),
            R.createElement('span', { className: 'dsh-mm-version-badge' }, VERSION)),
          R.createElement('span', { className: 'dsh-mm-desc' }, '接入即时通讯渠道，让 AI 通过 Telegram 与你对话。')),
        R.createElement('span', { className: 'dsh-mm-btns' },
          R.createElement('a', { className: 'dsh-mm-btn-link', href: REPO, target: '_blank', rel: 'noreferrer', onClick: (e) => e.stopPropagation() }, 'ideasir'),
          R.createElement('button', { className: 'dsh-mm-btn-uninstall', onClick: (e) => { e.stopPropagation(); if (confirm('确定卸载 Very IM 插件？')) {} } }, '卸载'),
          R.createElement('button', { className: 'dsh-mm-btn-update', style: { color: 'var(--dsw-alias-label-tertiary)' }, onClick: (e) => e.stopPropagation() }, '已最新'),
          R.createElement('button', { className: 'dsh-mm-btn-update', onClick: (e) => { e.stopPropagation(); setModal('check'); runCheck() }, title: '智能检测' },
            R.createElement('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4 } }, R.createElement('span', { dangerouslySetInnerHTML: { __html: ScanSvg } }), '智能检测')),
          R.createElement('span', { className: 'dsh-mm-chevron' + (open ? ' dsh-mm-chevron-open' : ''), style: { transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .14s ease-in-out' } },
            R.createElement('span', { dangerouslySetInnerHTML: { __html: ChevronSvg } })))),

      // ── 展开内容 ──
      open && R.createElement('div', { className: 'dsh-mm-body' },
        // 已连接渠道标签
        chans.length > 0 && R.createElement('div', { className: 'dsh-vm-chs' },
          ...chans.map(ch => R.createElement('div', { key: ch.id, className: 'dsh-vm-ch', onClick: () => openCfg(ch) },
            R.createElement('span', { className: 'dsh-vm-dot on' }),
            R.createElement('span', { dangerouslySetInnerHTML: { __html: TgSvg } }),
            R.createElement('span', { style: { fontSize: 13, color: 'var(--dsw-alias-label-primary,#f9fafb)' } }, `@${ch.botUsername || ch.name}`),
            ch.proxy && R.createElement('span', { style: { fontSize: 11, color: 'var(--dsw-alias-label-tertiary,#999)', background: 'var(--dsw-alias-bg-layer-1)', borderRadius: 4, padding: '1px 6px' } }, '代理'),
            ch.workspace && R.createElement('span', { style: { fontSize: 11, color: 'var(--dsw-alias-label-tertiary,#999)', background: 'var(--dsw-alias-bg-layer-1)', borderRadius: 4, padding: '1px 6px' } }, '工作区'),
            R.createElement('span', { onClick: (e) => { e.stopPropagation(); delChannel(ch.id) }, title: '删除', style: { cursor: 'pointer', color: 'var(--dsw-alias-label-tertiary,#999)', marginLeft: 4 } },
              R.createElement('span', { dangerouslySetInnerHTML: { __html: TrashSvg } })))),

        // 大号添加渠道按钮（与 passpass「打开密码本」同尺寸）
        R.createElement('button', {
          style: {
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            width: '100%', padding: '10px 0', borderRadius: 10, border: 'none',
            background: 'var(--dsw-alias-button-primary-fill,var(--dsw-alias-brand-primary))',
            color: 'var(--dsw-alias-label-primary-inverted,#fff)', cursor: 'pointer',
            fontSize: 13, fontWeight: 600, transition: 'filter .12s',
          },
          onClick: () => { setModal('pick-type'); setEditing(null); setToken(''); setProxy(''); setWorkspace(''); setBotInfo(null); setFb(null) },
        }, R.createElement('span', { dangerouslySetInnerHTML: { __html: PlusSvg } }), '添加渠道')));

    // ── 弹窗们 ──
    const mods = []

    // 选择渠道类型
    if (modal === 'pick-type') {
      mods.push(R.createElement('div', { key: 'pick', className: 'dsh-vm-overlay', onClick: (e) => { if (e.target === e.currentTarget) setModal(null) } },
        R.createElement('div', { className: 'dsh-vm-modal' },
          R.createElement('div', { className: 'dsh-vm-mh' }, R.createElement('span', { className: 'dsh-vm-mt' }, '选择渠道'),
            R.createElement('button', { className: 'dsh-vm-mx', onClick: () => setModal(null), dangerouslySetInnerHTML: { __html: CloseSvg } })),
          R.createElement('div', { className: 'dsh-vm-mb' },
            R.createElement('div', { className: 'dsh-vm-cl' },
              R.createElement('div', { className: 'dsh-vm-co', onClick: () => { setModal('cfg-telegram'); setEditing(null); setToken(''); setProxy(''); setWorkspace(''); setBotInfo(null); setFb(null) } },
                R.createElement('div', { className: 'dsh-vm-ci', dangerouslySetInnerHTML: { __html: TgSvg } }),
                R.createElement('div', { className: 'dsh-vm-ct' },
                  R.createElement('div', { className: 'dsh-vm-cn' }, 'Telegram'),
                  R.createElement('div', { className: 'dsh-vm-cd' }, '通过 Bot API 接入 Telegram 机器人'))))))))
    }

    // Telegram 配置弹窗
    if (modal === 'cfg-telegram') {
      mods.push(R.createElement('div', { key: 'cfg', className: 'dsh-vm-overlay', onClick: (e) => { if (e.target === e.currentTarget) { setModal(null); setEditing(null) } } },
        R.createElement('div', { className: 'dsh-vm-modal' },
          R.createElement('div', { className: 'dsh-vm-mh' },
            R.createElement('span', { className: 'dsh-vm-mt' }, editing ? '编辑 Telegram 渠道' : '接入 Telegram'),
            R.createElement('button', { className: 'dsh-vm-mx', onClick: () => { setModal(null); setEditing(null) }, dangerouslySetInnerHTML: { __html: CloseSvg } })),
          R.createElement('div', { className: 'dsh-vm-mb' },
            // Bot Token
            R.createElement('div', { className: 'dsh-vm-mf' },
              R.createElement('label', null, 'Bot Token'),
              R.createElement('input', { type: 'password', placeholder: '从 @BotFather 获取', value: token, onChange: (e) => setToken(e.target.value), onKeyDown: (e) => { if (e.key === 'Enter') testToken() } }),
              R.createElement('small', null, '在 Telegram 中搜索 @BotFather，发送 /newbot 创建')),
            // 代理
            R.createElement('div', { className: 'dsh-vm-mf' },
              R.createElement('label', null, '代理服务器'),
              R.createElement('input', { type: 'text', placeholder: 'socks5://127.0.0.1:1080 或 https://proxy:8080', value: proxy, onChange: (e) => setProxy(e.target.value) }),
              R.createElement('small', null, '可选。国内网络需要代理才能连接 Telegram API。支持 HTTP/HTTPS/SOCKS5')),
            // 工作区
            R.createElement('div', { className: 'dsh-vm-mf' },
              R.createElement('label', null, '工作区路径'),
              R.createElement('input', { type: 'text', placeholder: '/vol1/1000/DeepSeek/telegram', value: workspace, onChange: (e) => setWorkspace(e.target.value) }),
              R.createElement('small', null, '可选。留空使用 DSH 默认工作区')),
            // 验证按钮 + 反馈
            R.createElement('div', { style: { display: 'flex', gap: 8 } },
              R.createElement('button', { className: 'dsh-vm-b', onClick: testToken, type: 'button' }, '验证 Token')),
            fb && R.createElement('div', { className: `dsh-vm-fb dsh-vm-fb-${fb.t}` }, fb.m)),
          R.createElement('div', { className: 'dsh-vm-mft' },
            R.createElement('button', { className: 'dsh-vm-b', onClick: () => { setModal(null); setEditing(null) } }, '取消'),
            R.createElement('button', { className: 'dsh-vm-b dsh-vm-bp', onClick: saveChannel, disabled: saving || !token.trim() }, saving ? '保存中...' : '保存并连接')))))
    }

    // 智能检测弹窗
    if (modal === 'check') {
      mods.push(R.createElement('div', { key: 'check', className: 'dsh-vm-overlay', onClick: (e) => { if (e.target === e.currentTarget) setModal(null) } },
        R.createElement('div', { className: 'dsh-vm-modal' },
          R.createElement('div', { className: 'dsh-vm-mh' },
            R.createElement('span', { className: 'dsh-vm-mt' }, '智能检测'),
            R.createElement('button', { className: 'dsh-vm-mx', onClick: () => setModal(null), dangerouslySetInnerHTML: { __html: CloseSvg } })),
          R.createElement('div', { className: 'dsh-vm-mb' },
            // 已添加渠道
            R.createElement('div', null,
              R.createElement('div', { style: { fontSize: 13, fontWeight: 500, color: 'var(--dsw-alias-label-primary)', marginBottom: 8 } }, '已添加渠道'),
              checkResult?.ok ? R.createElement('div', { className: 'dsh-vm-ck' },
                ...checkResult.channels.map((ch) => R.createElement('div', { key: ch.id, className: `dsh-vm-ck-row ${ch.healthy ? 'dsh-vm-ck-ok' : 'dsh-vm-ck-er' }` },
                  R.createElement('span', { className: 'dsh-vm-ck-dot' }),
                  R.createElement('span', { className: 'dsh-vm-ck-name' }, `${ch.name} (@${ch.username})`),
                  R.createElement('span', { className: 'dsh-vm-ck-ms' }, ch.healthy ? `${ch.latencyMs}ms` : (ch.error || '不可达')),
                  ch.proxy && R.createElement('span', { className: 'dsh-vm-ck-ms' }, '代理'),
                  ch.workspace && R.createElement('span', { className: 'dsh-vm-ck-ms' }, '工作区')))
              : checking ? R.createElement('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' } }, '检测中...')
              : chans.length === 0 ? R.createElement('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' } }, '暂无渠道')
              : null),
            // 支持的渠道
            R.createElement('div', { style: { marginTop: 16 } },
              R.createElement('div', { style: { fontSize: 13, fontWeight: 500, color: 'var(--dsw-alias-label-primary)', marginBottom: 8 } }, '支持的渠道'),
              R.createElement('div', { className: 'dsh-vm-ck' },
                R.createElement('div', { className: 'dsh-vm-ck-row dsh-vm-ck-ok' },
                  R.createElement('span', { className: 'dsh-vm-ck-dot' }),
                  R.createElement('span', { dangerouslySetInnerHTML: { __html: TgSvg }, style: { width: 18, height: 18 } }),
                  R.createElement('span', { className: 'dsh-vm-ck-name' }, 'Telegram'),
                  R.createElement('span', { className: 'dsh-vm-ck-ms' }, 'Bot API 长轮询')))),
            R.createElement('button', { className: 'dsh-vm-b', onClick: runCheck, disabled: checking, style: { marginTop: 8 } }, checking ? '检测中...' : '重新检测')))))
    }

    return R.createElement(R.Fragment, null, Card, ...mods)
  }

  // 注册设置面板
  ctx.slots.inject('settings.plugin.item', () => {
    const register = ctx.slots.register.bind(ctx.slots)
    return register({ name: 'settings.plugin.item', key: 'veryim', priority: 50, inject: () => ({}) }, VeryIMPluginCard)
  })
}

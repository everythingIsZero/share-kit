/**
 * sheet.mjs — Action Sheet / 海报预览层 / 引导条（DOM 薄壳 + 样式单源）
 *
 * 只做视图与交互收尾，不做决策：列什么项、哪项高亮由 view.mjs 的视图模型给定。
 * 三个浮层共用 createOverlay 工厂（遮罩 + 入退场动画 + Esc/遮罩关闭 + DOM 自清理）；
 * 样式经 ensureStyles 一次性注入（幂等 id），业务站可用 CSS 覆盖自己的视觉。
 *
 * 红线（R4）：反馈落在触发元素本身，本文件的浮层只用于「动作本体」——
 * 海报预览（预览层，图是基本操作）与方式选择（sheet 兜底），不做 toast 式结果通知。
 */

const STYLE_ID = 'share-kit-ui-style'

/** 浮层样式与触发按钮基础样式（本文件是 UI 层样式单源） */
const CSS = `
.share-kit-mask { position: fixed; inset: 0; z-index: 9990; background: rgba(0,0,0,.45); opacity: 0; transition: opacity .22s ease; }
.share-kit-mask.share-kit-open { opacity: 1; }
.share-kit-sheet { position: absolute; left: 0; right: 0; bottom: 0; margin: 0 auto; max-width: 500px; background: #fff; border-radius: 16px 16px 0 0; transform: translateY(100%); transition: transform .25s ease; padding-bottom: env(safe-area-inset-bottom, 0px); }
.share-kit-sheet.share-kit-open { transform: translateY(0); }
.share-kit-sheet-title { padding: 14px 16px 4px; text-align: center; font-size: 13px; color: #8a8a8a; }
.share-kit-sheet-item { display: flex; align-items: center; justify-content: center; gap: 6px; width: 100%; min-height: 52px; padding: 14px 16px; border: 0; background: none; font-size: 16px; color: #222; cursor: pointer; -webkit-tap-highlight-color: transparent; }
.share-kit-sheet-item:active { background: #f7f7f7; }
.share-kit-sheet-item.primary { color: #07c160; font-weight: 600; }
.share-kit-badge { font-size: 11px; line-height: 17px; padding: 0 5px; color: #07c160; border: 1px solid rgba(7,193,96,.4); border-radius: 4px; }
.share-kit-sheet-cancel { display: block; width: calc(100% - 24px); margin: 4px auto 12px; min-height: 48px; border: 0; border-radius: 12px; background: #f7f7f8; font-size: 16px; font-weight: 500; color: #222; cursor: pointer; }
.share-kit-sheet-cancel:active { background: #ededf0; }
.share-kit-preview { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; background: rgba(0,0,0,.88); opacity: 0; transition: opacity .22s ease; padding: 16px; }
.share-kit-preview.share-kit-open { opacity: 1; }
.share-kit-preview img { max-width: 92vw; max-height: 68vh; }
.share-kit-preview-tip { color: #ffd970; font-size: 15px; }
.share-kit-preview-actions { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
.share-kit-preview-btn { padding: 8px 22px; border: 1px solid rgba(255,255,255,.35); border-radius: 20px; background: none; color: #fff; font-size: 13px; cursor: pointer; }
.share-kit-preview-btn.primary { border-color: transparent; background: #07c160; font-weight: 600; }
.share-kit-preview-close { padding: 8px 22px; border: 1px solid #777; border-radius: 20px; background: none; color: #ccc; font-size: 13px; cursor: pointer; }
.share-kit-tip { position: fixed; top: 0; left: 50%; transform: translate(-50%, -110%); z-index: 9992; margin-top: max(12px, env(safe-area-inset-top, 0px)); padding: 10px 16px; max-width: 86vw; border-radius: 10px; background: rgba(17,17,17,.92); color: #fff; font-size: 14px; line-height: 1.5; transition: transform .28s ease; }
.share-kit-tip.share-kit-open { transform: translate(-50%, 0); }
.share-kit-trigger { display: block; width: 100%; padding: 12px 16px; border: 0; border-radius: 10px; background: #07c160; color: #fff; font-size: 15px; font-weight: 500; cursor: pointer; }
.share-kit-trigger:active { background: #06ad56; }
`

/** 幂等注入样式（多次调用只插一份） */
export function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
}

/**
 * 通用浮层工厂：遮罩 + build 出的内容面板 + 入退场动画 + Esc/遮罩关闭。
 * `build(close)` 返回内容面板节点（close 为工厂的关闭函数，函数声明提升，可直接引用）。
 */
function createOverlay({ dismissible = true, build }) {
  ensureStyles()
  const mask = document.createElement('div')
  mask.className = 'share-kit-mask'
  const panel = build(close)

  const onKey = (e) => {
    if (e.key === 'Escape') close()
  }
  if (dismissible) {
    mask.addEventListener('click', (e) => {
      if (e.target === mask) close()
    })
    document.addEventListener('keydown', onKey)
  }

  mask.appendChild(panel)
  document.body.appendChild(mask)
  requestAnimationFrame(() => {
    mask.classList.add('share-kit-open')
    panel.classList.add('share-kit-open')
  })

  function close() {
    mask.classList.remove('share-kit-open')
    panel.classList.remove('share-kit-open')
    document.removeEventListener('keydown', onKey)
    setTimeout(() => mask.remove(), 260)
  }
  return { close }
}

/**
 * Action Sheet：`items` 为 view.sheetItemsOf 的产物，`onSelect(actionId)` 在项被点击时
 * **同步**回调（sheet 先收起再回调，调用方在回调里同步发起执行，满足 R14）。
 */
export function showActionSheet({ title, items, onSelect }) {
  return createOverlay({
    build: (close) => {
      const panel = document.createElement('div')
      panel.className = 'share-kit-sheet'
      panel.setAttribute('role', 'dialog')
      panel.setAttribute('aria-modal', 'true')

      const head = document.createElement('div')
      head.className = 'share-kit-sheet-title'
      head.textContent = title
      panel.appendChild(head)

      for (const item of items) {
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'share-kit-sheet-item' + (item.isPrimary ? ' primary' : '')
        btn.dataset.action = item.id
        btn.textContent = item.label
        if (item.isPrimary) {
          const badge = document.createElement('span')
          badge.className = 'share-kit-badge'
          badge.textContent = '推荐'
          btn.appendChild(badge)
        }
        btn.addEventListener('click', () => {
          close()
          if (typeof onSelect === 'function') onSelect(item.id)
        })
        panel.appendChild(btn)
      }

      const cancel = document.createElement('button')
      cancel.type = 'button'
      cancel.className = 'share-kit-sheet-cancel'
      cancel.textContent = '取消'
      cancel.addEventListener('click', close)
      panel.appendChild(cancel)
      return panel
    },
  }).close
}

/**
 * 海报预览层：全屏大图 + 可选提示 + 层内方式按钮行（图片产物点击分享的统一入口）。
 * 图是基本操作——先见图，方式收进层内，选择权不丢失；长按保存不渲染按钮，
 * 大图本身可长按，由 `tip` 说明。`actions` 为 `[{ id, label, isPrimary, onSelect }]`，
 * `id` 落到 `data-action` 供验收与业务定位；关闭按钮由层自带、恒在行尾。
 */
export function showPreviewOverlay({ imageUrl, tip, actions }) {
  return createOverlay({
    build: (close) => {
      const panel = document.createElement('div')
      panel.className = 'share-kit-preview'
      panel.setAttribute('role', 'dialog')
      panel.setAttribute('aria-modal', 'true')

      const img = document.createElement('img')
      img.src = imageUrl
      img.alt = '分享图片预览'
      panel.appendChild(img)

      if (tip) {
        const tipEl = document.createElement('div')
        tipEl.className = 'share-kit-preview-tip'
        tipEl.textContent = tip
        panel.appendChild(tipEl)
      }

      const row = document.createElement('div')
      row.className = 'share-kit-preview-actions'
      for (const act of Array.isArray(actions) ? actions : []) {
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'share-kit-preview-btn' + (act.isPrimary ? ' primary' : '')
        btn.dataset.action = act.id
        btn.textContent = act.label
        btn.addEventListener('click', () => act.onSelect())
        row.appendChild(btn)
      }

      const closeBtn = document.createElement('button')
      closeBtn.type = 'button'
      closeBtn.className = 'share-kit-preview-close'
      closeBtn.textContent = '关闭'
      closeBtn.addEventListener('click', close)
      row.appendChild(closeBtn)
      panel.appendChild(row)
      return panel
    },
  }).close
}

/** 顶部引导条：卡片类引导动作的轻提示（自动消失，不打断操作） */
export function showTipBar(text) {
  ensureStyles()
  const bar = document.createElement('div')
  bar.className = 'share-kit-tip'
  bar.textContent = text
  document.body.appendChild(bar)
  requestAnimationFrame(() => bar.classList.add('share-kit-open'))
  setTimeout(() => {
    bar.classList.remove('share-kit-open')
    setTimeout(() => bar.remove(), 300)
  }, 3500)
}

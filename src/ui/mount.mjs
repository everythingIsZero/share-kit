/**
 * mount.mjs — mountShare：通用分享挂载（高层 API，无框架）
 *
 * 业务站把「想分享的东西」作为 artifact 传入，得到一个分享按钮与全部后续交互：
 * 点击 → 该环境真实可用的方式列表（Action Sheet）→ 选择后执行 → 反馈落在按钮上。
 * 海报生成不在此处：那是 render-dom 的独立方法链，业务先产 blob / 文件再放进 artifact。
 *
 * 红线落点：
 * - 红线 2：列表项来自 core `listActions`（能力表 + 运行时信号双重过滤），绝不列会失败的项；
 * - R14 手势内同步调用：唯一动作直出与 sheet 项点击，executeAction 都在点击同步段发起；
 * - R4 反馈落在触发元素：结果文案写回按钮本身，不用 toast 弹窗。
 *
 * 时序要点：share.system 受一次性用户激活信号闸，首帧探不到——列表必须在**点击瞬间**
 * 重算才能拿到含系统分享的完整列表；首帧列表只用于决定按钮文案（唯一动作时直出动作名）。
 */

import { listActions, normalizeFingerprint, renderCopy } from '../core/index.mjs'
import { collectSignals, executeAction } from '../web/index.mjs'
import { buttonLabelOf, sheetItemsOf, sheetTitleOf } from './view.mjs'
import { ensureStyles, showActionSheet, showLongpressOverlay, showTipBar } from './sheet.mjs'

/** 直接下载（save.album）：a[download] 点击（落点由环境决定——手机进相册/下载，桌面进下载目录） */
function defaultDownload({ url, filename }) {
  const a = document.createElement('a')
  a.href = url
  if (filename) a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/** 复制链接：clipboard API 优先，静默失败（微信内常见）落 execCommand 兜底 */
async function defaultCopy(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      /* 落 execCommand */
    }
  }
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.cssText = 'position:fixed;top:-9999px;opacity:0;'
  document.body.appendChild(ta)
  ta.select()
  try {
    document.execCommand('copy')
  } finally {
    ta.remove()
  }
}

/** 长按引导层的图源：artifact.imageUrl 优先，否则用首个 File 现造 blob URL */
function fileImageUrl(artifact) {
  if (typeof artifact.imageUrl === 'string' && artifact.imageUrl.length > 0) return artifact.imageUrl
  const f = artifact.files && artifact.files[0]
  if (typeof File !== 'undefined' && f instanceof File) return URL.createObjectURL(f)
  return null
}

/**
 * 挂载分享按钮。
 *
 * @param target   挂载点 DOM 节点（按钮插到其末尾）
 * @param options  `{ artifact, labels?, onResult? }`
 *   - `artifact`：`{ kind: 'image'|'video'|'link', url?, title?, text?, files?, filename?, imageUrl? }`。
 *     是**执行时取值**的可变引用——先挂载、渲染完成后再补 `files` / `imageUrl` 即可；
 *   - `labels`：`{ button?, sheetTitle?, actions?: { <动作id>: 覆盖文案 } }`；
 *   - `onResult(result)`：每次执行后回调（`{ ok, outcome, action, mode }`），供业务埋点上报。
 * @returns `{ unmount }`
 */
export function mountShare(target, options = {}) {
  if (!target || typeof target.appendChild !== 'function') {
    throw new TypeError('mountShare(target, options)：target 必须是可挂载的 DOM 节点')
  }
  const { artifact = {}, labels, onResult } = options
  const kind = artifact.kind

  const deps = {
    share: (payload) => navigator.share(payload),
    download: defaultDownload,
    copy: defaultCopy,
    url: artifact.url || location.href,
    title: artifact.title,
    text: artifact.text,
    filename: artifact.filename,
    get files() {
      return artifact.files
    },
  }

  function decideNow(signals) {
    const { fingerprint } = normalizeFingerprint(signals)
    return listActions({ fingerprint, artifactKind: kind, signals })
  }

  // 首帧：只决定按钮文案（激活信号此时尚未发生，列表不可信，不用于执行）
  const firstList = decideNow(collectSignals())
  ensureStyles()
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'share-kit-trigger'
  button.textContent = buttonLabelOf(firstList, kind, labels)
  target.appendChild(button)

  let disposed = false
  let overlayClose = null

  const setLabel = (text) => {
    if (!disposed) button.textContent = text
  }

  const doneLabel = (actionId) => {
    if (actionId === 'copy.link') return renderCopy('done-copied')
    if (actionId === 'save.album') return renderCopy('done-saved')
    return '已完成 · 可再试一次'
  }

  function run(actionId) {
    setLabel('正在处理…')
    Promise.resolve(executeAction(actionId, deps)).then((result) => {
      if (disposed) return
      setLabel(result.ok ? doneLabel(result.action) : '没完成，再点一次试试')
      if (result.mode === 'guidance') {
        if (result.action === 'preview.longpress') {
          const src = fileImageUrl(artifact)
          if (src) overlayClose = showLongpressOverlay({ imageUrl: src, secondary: copySecondary() })
        } else {
          // share.card.wx / share.card.miniapp：卡片由宿主菜单转发，给一步引导提示
          showTipBar(renderCopy('card-wx-link'))
        }
      }
      if (typeof onResult === 'function') onResult(result)
    })
  }

  // 长按引导层内的次要方式（copy.link 无条件可用，恒可作次要项）
  function copySecondary() {
    return { label: '复制链接', onSelect: () => run('copy.link') }
  }

  function handleClick() {
    if (disposed) return
    // 点击瞬间重决策（同步纯函数，不烧激活）：一次性用户激活只在此刻为 true
    const list = decideNow(collectSignals())
    const primary = list.actions[0].id
    // 主推荐是长按保存（引导型）：直接弹大图引导层，不弹方式列表——
    // 长按层自带完整上下文（大图 + 长按提示），经 sheet 中转反而多一步；
    // 次要方式（复制链接）收进层内，选择权不丢失
    if (primary === 'preview.longpress') {
      const src = fileImageUrl(artifact)
      if (src) {
        overlayClose = showLongpressOverlay({ imageUrl: src, secondary: copySecondary() })
        return
      }
    }
    if (list.actions.length === 1) {
      run(primary) // 唯一动作：不弹列表，同步段直接执行（R14）
      return
    }
    overlayClose = showActionSheet({
      title: sheetTitleOf(labels),
      items: sheetItemsOf(list, kind, labels),
      onSelect: run, // sheet 项点击回调内同步发起执行（新手势，R14 同样满足）
    })
  }

  button.addEventListener('click', handleClick)

  return {
    unmount() {
      disposed = true
      button.removeEventListener('click', handleClick)
      button.remove()
      if (typeof overlayClose === 'function') overlayClose()
    },
  }
}

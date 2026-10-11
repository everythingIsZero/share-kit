/**
 * mount.mjs — mountShare：通用分享挂载（高层 API，无框架）
 *
 * 业务站把「想分享的东西」作为 artifact 传入，得到一个分享按钮与全部后续交互：
 * 点击 → **图片产物先弹海报预览层**（大图 + 层内方式按钮，长按保存即大图本身）；
 * 无图可显（link / video 产物、图未就绪）弹 Action Sheet 兜底 → 选择后执行 → 反馈落在按钮上。
 * 海报生成不在此处：那是 render-dom 的独立方法链，业务先产 blob / 文件再放进 artifact。
 *
 * 红线落点：
 * - 红线 2：层内按钮与 sheet 项都来自 core `listActions`（能力表 + 运行时信号双重过滤），绝不列会失败的项；
 * - R14 手势内同步调用：唯一动作直出与层内 / sheet 项点击，executeAction 都在点击同步段发起；
 * - R4 反馈落在触发元素：结果文案写回按钮本身，不用 toast 弹窗。
 *
 * 时序要点：share.system 受一次性用户激活信号闸，首帧探不到——列表必须在**点击瞬间**
 * 重算才能拿到含系统分享的完整列表；首帧列表只用于决定按钮文案。
 */

import { listActions, normalizeFingerprint, renderCopy } from '../core/index.mjs'
import { collectSignals, executeAction } from '../web/index.mjs'
import { buttonLabelOf, sheetItemsOf, sheetTitleOf } from './view.mjs'
import { ensureStyles, showActionSheet, showPreviewOverlay, showTipBar } from './sheet.mjs'

/** 直接下载（save.album）：a[download] 点击（落点由环境决定——手机落「本机文件」/下载，桌面进下载目录；非相册） */
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
  // 空值稳健：没有可复制的公开链时静默返回——绝不把 undefined 强转成字面量 "undefined" 复制出去
  if (typeof text !== 'string' || text.length === 0) return
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
 * 引导类动作 → 引导文案 id 的映射（S11：tip 按动作选文案，不恒用 `card-wx-link`）。
 * 只做「动作 → core 文案 id」的接线，文案本体单源在 core `copy.mjs`（适配层不硬编码文案）。
 * 导出仅供测试断言映射；非包公共出口（`./ui` 不 re-export）。
 */
export const GUIDANCE_COPY_ID = Object.freeze({
  'share.card.wx': 'card-wx-link',
  'share.card.miniapp': 'card-miniapp-link',
  'preview.longpress': 'longpress-image',
})

/** 敏感 query 键：出现即判非公开（私有页常带 token 之类，绝不能被复制/分享出去） */
export const SENSITIVE_QUERY_KEYS = Object.freeze(['token', 't', 'access_token'])

/** 默认公开分享域（业务可用 mountShare 的 `publicHosts` 覆盖为站点声明的公开域） */
export const DEFAULT_PUBLIC_HOSTS = Object.freeze(['share.hxym18.com'])

/**
 * 判一个 URL 是否**公开分享链**（S3）。仅当同时满足：host 在允许域内、且不含敏感 query。
 * 私有页 / 带 token / 非允许域 / 非法 URL / 空串一律 false——分享与复制只允许公开链，
 * 页面地址（`location.href` 之类）天然不满足，从而杜绝私有页外泄。
 *
 * @param url         待判 URL
 * @param publicHosts 站点声明的公开域列表（缺省用 DEFAULT_PUBLIC_HOSTS）
 */
export function isPublicShareUrl(url, publicHosts = DEFAULT_PUBLIC_HOSTS) {
  if (typeof url !== 'string' || url.length === 0) return false
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  const hosts = Array.isArray(publicHosts) && publicHosts.length > 0 ? publicHosts : DEFAULT_PUBLIC_HOSTS
  if (!hosts.includes(parsed.hostname)) return false
  for (const key of parsed.searchParams.keys()) {
    if (SENSITIVE_QUERY_KEYS.includes(key.toLowerCase())) return false
  }
  return true
}

/**
 * 挂载分享按钮。
 *
 * @param target   挂载点 DOM 节点（按钮插到其末尾）
 * @param options  `{ artifact, labels?, onResult? }`
 *   - `artifact`：`{ kind: 'image'|'video'|'link', url?, title?, text?, files?, filename?, imageUrl? }`。
 *     是**执行时取值**的可变引用——先挂载、渲染完成后再补 `files` / `imageUrl` 即可；
 *   - `labels`：`{ button?, sheetTitle?, actions?: { <动作id>: 覆盖文案 } }`；
 *   - `onResult(result)`：每次执行后回调（`{ ok, outcome, action, mode }`），供业务埋点上报；
 *   - `publicHosts`：站点声明的公开分享域（缺省 `share.hxym18.com`）；非公开链会被拒绝复制/分享。
 * @returns `{ unmount }`
 */
export function mountShare(target, options = {}) {
  if (!target || typeof target.appendChild !== 'function') {
    throw new TypeError('mountShare(target, options)：target 必须是可挂载的 DOM 节点')
  }
  const { artifact = {}, labels, onResult, publicHosts } = options
  const kind = artifact.kind

  const deps = {
    share: (payload) => navigator.share(payload),
    download: defaultDownload,
    copy: defaultCopy,
    // 全字段**执行时取值**（getter）：业务可先挂载、渲染完成后再补 artifact 字段，点击时取到最新值。
    // S3：url 只作公开分享链，**不再 `|| location.href`**——页面地址可能是私有页（带 token），
    // 落到复制/系统分享即外泄；缺 url 时给空串（绝不 undefined，避免被强转成字面量 "undefined" 复制出去）。
    get url() {
      return artifact.url || ''
    },
    get title() {
      return artifact.title
    },
    get text() {
      return artifact.text
    },
    get filename() {
      return artifact.filename
    },
    // 下载源（save.album）：优先文件，缺 File 时用 fileUrl
    get fileUrl() {
      return artifact.fileUrl
    },
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
  const initialLabel = buttonLabelOf(firstList, kind, labels)
  ensureStyles()
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'share-kit-trigger'
  button.textContent = initialLabel
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

  /** 该动作是否会用到**分享链**（url）；share.system 有文件时用文件、不用 url */
  function usesShareUrl(actionId) {
    if (actionId === 'share.system') return !(deps.files && deps.files.length > 0)
    return actionId === 'copy.link' || actionId === 'share.card.wx' || actionId === 'share.card.miniapp'
  }

  function run(actionId) {
    // S3：非公开链（私有页 / 带 token）不得复制或分享出去——拒绝执行并如实反馈，绝不静默外泄
    if (usesShareUrl(actionId) && !isPublicShareUrl(deps.url, publicHosts)) {
      const text = renderCopy('fail-private-url')
      setLabel(text)
      showTipBar(text)
      if (typeof onResult === 'function') onResult({ ok: false, outcome: 'blocked', action: actionId, mode: 'invoked' })
      return
    }
    setLabel('正在处理…')
    Promise.resolve(executeAction(actionId, deps)).then((result) => {
      if (disposed) return
      if (result.ok && result.mode === 'guidance') {
        // 引导类动作**不报「已完成」**：卡片由宿主菜单转发、长按由用户完成，界面只说该怎么做。
        // 文案 id 按 result.action 选（wx / miniapp 各自的引导不同），文案本体在 core。
        const tipText = renderCopy(GUIDANCE_COPY_ID[result.action])
        setLabel(tipText || initialLabel)
        if (tipText) showTipBar(tipText)
      } else if (result.ok) {
        setLabel(doneLabel(result.action))
      } else if (result.outcome === 'cancelled') {
        // 用户取消不是失败：静默复原按钮，不显示「没完成」（AbortError 与真失败分开归因，R8）
        setLabel(initialLabel)
      } else {
        setLabel('没完成，再点一次试试')
      }
      if (typeof onResult === 'function') onResult(result)
    })
  }

  /**
   * 海报预览层（图片产物点击的统一入口）：大图 + 可选长按提示 + 层内方式按钮行。
   * preview.longpress 不渲染按钮——大图本身可长按，由 tip 说明；其余动作逐个转按钮
   * （主推荐高亮），点击收层后在同一手势的同步段执行（R14）。
   */
  function openPreview(list) {
    const items = sheetItemsOf(list, kind, labels).filter((i) => i.id !== 'preview.longpress')
    const hasLongpress = list.actions.some((a) => a.id === 'preview.longpress')
    overlayClose = showPreviewOverlay({
      imageUrl: fileImageUrl(artifact),
      tip: hasLongpress ? '长按图片，可保存或发送给朋友' : null,
      actions: items.map((i) => ({
        id: i.id,
        label: i.label,
        isPrimary: i.isPrimary,
        onSelect: () => {
          if (typeof overlayClose === 'function') {
            const close = overlayClose
            overlayClose = null
            close()
          }
          run(i.id)
        },
      })),
    })
  }

  function handleClick() {
    if (disposed) return
    // 点击瞬间重决策（同步纯函数，不烧激活）：一次性用户激活只在此刻为 true
    const list = decideNow(collectSignals())
    // 图是基本操作：图片产物先弹海报预览层，方式收进层内（出资人拍板，不再先弹无图列表）
    if (kind === 'image' && fileImageUrl(artifact)) {
      openPreview(list)
      return
    }
    // 无图可显（link / video 产物，或图未就绪）：Action Sheet 兜底；
    // preview.longpress 没有大图可长按，剔出列表避免死项
    const items = sheetItemsOf(list, kind, labels).filter((i) => i.id !== 'preview.longpress')
    if (items.length === 1) {
      run(items[0].id) // 唯一动作：不弹列表，同步段直接执行（R14）
      return
    }
    overlayClose = showActionSheet({
      title: sheetTitleOf(labels),
      items,
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

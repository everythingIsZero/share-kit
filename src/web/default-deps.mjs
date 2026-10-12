/**
 * default-deps.mjs — 浏览器默认 deps（SH-1 下沉）
 *
 * fang / zitie / nuantie 各写过一遍的 `systemShare`（系统分享）与 `triggerDownload`
 * （`a[download]` 下载）在此单源。`executeAction(actionId, deps)` 的注入实现可直接取用：
 *
 * ```js
 * import { executeAction, systemShare, triggerDownload, defaultCopy } from '@hxym18/share-kit/web'
 * executeAction(id, { share: systemShare, download: triggerDownload, copy: defaultCopy, url, files, filename })
 * ```
 *
 * 红线（R14）：两个实现都是**同步段发起**——调用方在点击回调里直接调 `executeAction`，
 * 本文件不得在调用前 `await`（`triggerDownload` 全同步；`systemShare` 只转发 `navigator.share`）。
 *
 * 空源守卫（与 `web/execute.mjs` 同口径）：空 `url` 不造空 anchor——真实浏览器会把
 * `a.href=''` 解析成当前文档 URL，点「保存图片」实际下到整页 HTML。
 */

/**
 * 系统分享默认实现（注入给 `executeAction` 的 `share`）。
 * 有文件只传 `files`、无文件才传 `url`（混传会让 iOS 系统面板 / 微信把链接当主体）。
 * 接口缺席时**抛错**（由 `executeAction` 归为失败结果，绝不静默无反应）。
 */
export function systemShare(payload) {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined
  if (!nav || typeof nav.share !== 'function') throw new Error('navigator.share unavailable')
  const p = payload && typeof payload === 'object' ? payload : {}
  const files = Array.isArray(p.files) ? p.files : []
  const data = {}
  if (files.length > 0) data.files = files
  else if (typeof p.url === 'string' && p.url.length > 0) data.url = p.url
  if (p.title !== undefined) data.title = p.title
  if (p.text !== undefined) data.text = p.text
  return nav.share(data)
}

/**
 * 直接下载默认实现（注入给 `executeAction` 的 `download`）。
 * 先同步造 `a[download]` 并点击，再移除；接受两种入参形态：
 * - 对象 `{ url, filename }`（`executeAction` 的 deps 契约）；
 * - 位置式 `(url, filename)`（站点既有调用形态，减少迁移改动）。
 * 空源或非浏览器环境静默返回（不造空 anchor、不抛错）。
 */
export function triggerDownload(urlOrPayload, filenameArg) {
  let url
  let filename
  if (typeof urlOrPayload === 'string') {
    url = urlOrPayload
    filename = filenameArg
  } else if (urlOrPayload && typeof urlOrPayload === 'object') {
    url = urlOrPayload.url
    filename = urlOrPayload.filename
  }
  if (typeof document === 'undefined') return
  if (typeof url !== 'string' || url.length === 0) return
  const a = document.createElement('a')
  a.href = url
  if (filename) a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/**
 * 复制链接默认实现（注入给 `executeAction` 的 `copy`）。
 * `clipboard.writeText` 优先，失败静默落 `execCommand`（微信内常见）；
 * 空文本静默返回——绝不把 `undefined` 强转成字面量 `"undefined"` 复制出去。
 */
export async function defaultCopy(text) {
  if (typeof text !== 'string' || text.length === 0) return
  if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      /* 落 execCommand */
    }
  }
  if (typeof document === 'undefined') return
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

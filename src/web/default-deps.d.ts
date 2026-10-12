/**
 * default-deps.d.ts — 浏览器默认 deps 类型（手写声明，与 default-deps.mjs 同步维护）
 */

/**
 * 系统分享默认实现（注入给 `executeAction` 的 `share`）。
 * 有文件只传 `files`、无文件才传 `url`；`navigator.share` 缺席时抛错。
 */
export declare function systemShare(payload?: {
  files?: unknown
  url?: string
  title?: string
  text?: string
}): unknown

/**
 * 直接下载默认实现（注入给 `executeAction` 的 `download`）。
 * 接受对象 `{ url, filename }`（deps 契约）或位置式 `(url, filename)`；空源静默返回。
 */
export declare function triggerDownload(
  payload: { url?: string; filename?: string } | string
): void
export declare function triggerDownload(url: string, filename?: string): void

/**
 * 复制链接默认实现（注入给 `executeAction` 的 `copy`）。
 * 剪贴板优先、失败落 `execCommand`；两条路都失败**抛错**（由 executeAction 归为失败，不假报成功）。
 * 空文本静默返回（空源守卫，非失败）。
 */
export declare function defaultCopy(text: string): Promise<void>

/**
 * export.mjs — 画布导出（blob URL 优先，toBlob 失败降级 dataURL）
 *
 * 降级链（iOS 大画布 toBlob 会因内存不足回调 null）：
 * canvas → toBlob → 有 blob URL.createObjectURL？ → blob-url（体积小、避开 JPEG 黑边坑）
 *        → 无 createObjectURL 或 blob 为 null → dataURL PNG（绝不静默无反应）
 */

/** canvas → PNG Blob；toBlob 回调 null 或抛错都归一为 null（不悬挂、不外抛） */
export function canvasToBlob(canvas) {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob || null), 'image/png')
    } catch {
      resolve(null)
    }
  })
}

/**
 * 导出 PNG。返回 `{ kind, url, blob }`：
 * - `kind: 'blob-url'`：blob URL（浏览器且 blob 生成成功时）；
 * - `kind: 'data-url'`：dataURL PNG 降级（node 环境 / toBlob 失败）。
 * 调用方拿到 blob-url 后注意在用完时 `URL.revokeObjectURL` 释放。
 */
export async function exportPng(canvas) {
  const blob = await canvasToBlob(canvas)
  if (blob && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    return { kind: 'blob-url', url: URL.createObjectURL(blob), blob }
  }
  return { kind: 'data-url', url: canvas.toDataURL('image/png'), blob: null }
}

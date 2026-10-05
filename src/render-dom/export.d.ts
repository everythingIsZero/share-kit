/**
 * export.d.ts — 画布导出类型（手写声明，与 export.mjs 同步维护）
 */

/** 导出产物：blob URL 优先，dataURL 降级 */
export interface ExportResult {
  kind: 'blob-url' | 'data-url'
  url: string
  blob: Blob | null
}

/** canvas → PNG Blob；失败归一为 null */
export declare function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null>

/** 导出 PNG（blob URL 优先，toBlob 失败降级 dataURL） */
export declare function exportPng(canvas: HTMLCanvasElement): Promise<ExportResult>

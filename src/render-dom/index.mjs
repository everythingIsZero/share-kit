/**
 * index.mjs — share-kit render-dom 公共出口（包入口 `./render-dom`；浏览器专用）
 *
 * DOM → canvas 渲染器：海报 HTML 构建（posterHtml）、画布抓取（capture）、
 * 二维码源图（qrDataUrl）、导出降级（exportPng）。微信铁律见 render.mjs 文件头。
 */

export * from './render.mjs'
export * from './qr.mjs'
export * from './export.mjs'

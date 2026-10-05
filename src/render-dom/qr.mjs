/**
 * qr.mjs — 二维码源图生成（qrcode 库封装；node 与浏览器均可跑）
 *
 * 铁律④的配套：二维码源图必须 512px 高倍生成——导出海报 scale 4x 后码区仍清晰可扫
 * （160px 源会糊成噪点）。黑码白底是默认口径（扫码识别率优先，见 poster QR_DEFAULTS）。
 */

import QRCode from 'qrcode'

/** 高倍源图宽度（px）：导出后重绘/缩放都有余量 */
export const QR_SOURCE_WIDTH = 512

/**
 * PosterSpec.qr → data URL（纯封装，非法入参返回空串，渲染层按「无二维码」处理）。
 *
 * @param qr 冻结快照里的 qr 段（{ url, foreground, background, quietZone }）
 * @param options.width 源图宽度（默认 512；一般不需要改）
 */
export async function qrDataUrl(qr, options = {}) {
  if (!qr || typeof qr !== 'object' || typeof qr.url !== 'string' || qr.url.length === 0) return ''
  const o = options && typeof options === 'object' ? options : {}
  const width = Number.isInteger(o.width) && o.width > 0 ? o.width : QR_SOURCE_WIDTH
  try {
    return await QRCode.toDataURL(qr.url, {
      width,
      margin: Number.isInteger(qr.quietZone) && qr.quietZone > 0 ? qr.quietZone : 2,
      color: {
        dark: typeof qr.foreground === 'string' && qr.foreground ? qr.foreground : '#000000',
        light: typeof qr.background === 'string' && qr.background ? qr.background : '#FFFFFF',
      },
      errorCorrectionLevel: 'M',
    })
  } catch {
    return '' // 生成失败不外抛：调用方拿到空串按无码处理
  }
}

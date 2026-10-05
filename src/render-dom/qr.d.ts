/**
 * qr.d.ts — 二维码源图类型（手写声明，与 qr.mjs 同步维护）
 */

import type { PosterSpec } from '../poster/spec'

/** 高倍源图宽度（默认 512px） */
export declare const QR_SOURCE_WIDTH: 512

/** 二维码生成选项 */
export interface QrOptions {
  width?: number
}

/** PosterSpec.qr → data URL（非法入参返回空串） */
export declare function qrDataUrl(qr?: PosterSpec['qr'] | unknown, options?: QrOptions): Promise<string>

/**
 * render.d.ts — DOM 渲染器类型（手写声明，与 render.mjs 同步维护）
 */

import type { PosterSpec } from '../poster/spec'

/** 画布面积预算（像素数） */
export declare const BUDGETS: Readonly<{ CLARITY: number; CONSERVATIVE: number }>

/** 倍率上限（1 CSS px 最多铺 4 设备 px） */
export declare const MAX_SCALE: number

/** 倍率硬底 */
export declare const MIN_SCALE: number

/** 按面积预算反推整数倍率（结果夹在 [MIN_SCALE, MAX_SCALE]） */
export declare function scaleFor(w: number, h: number, budget: number): number

/** html2canvas 配置（backgroundColor 恒为不透明 6 位 hex） */
export interface RenderOptions {
  backgroundColor?: string
  windowWidth?: number
  windowHeight?: number
  scale?: number
}

/** 归一 html2canvas 配置 */
export declare function renderOptions(options?: RenderOptions): Readonly<Required<Omit<RenderOptions, 'scale'>>>

/** posterHtml 选项 */
export interface PosterHtmlOptions {
  /** qr.mjs 生成的二维码 data URL；缺省时不渲染码位 */
  qrDataUrl?: string
  /** 预留：外链图换同源代理的钩子（微信铁律⑤） */
  hooks?: {
    resolveImage?: (url: string) => string
  }
}

/** PosterSpec → 海报 HTML 字符串（纯函数；微信铁律②③④的落点） */
export declare function posterHtml(spec?: PosterSpec | unknown, options?: PosterHtmlOptions): string

/** 抓取海报画布（两档预算降级重试；两档都失败返回 null） */
export declare function capture(el: HTMLElement, options?: RenderOptions): Promise<HTMLCanvasElement | null>

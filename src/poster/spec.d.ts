/**
 * spec.d.ts — share-kit poster 冻结快照类型（手写声明，与 spec.mjs 同步维护）
 */

/** 版式（决定画布尺寸） */
export type PosterFormat = 'card' | 'long' | 'og'

/** 主题色板成员 */
export interface PosterTheme {
  name: string
  primary: string
  background: string
  onPrimary: string
  emphasis: string
}

/** 画布尺寸 */
export interface PosterSize {
  w: number
  h: number
}

/** 关键信息对（海报 L2 层） */
export interface PosterFact {
  label: string
  value: string
}

/** 业务输入：content 与 qr 都可部分缺省 */
export interface PosterSpecInput {
  format?: PosterFormat | string
  themeId?: string
  content?: {
    headline?: string
    subline?: string
    facts?: Array<{ label?: unknown; value?: unknown }>
    owner?: string
    cta?: string
  }
  qr?: {
    url?: string
    foreground?: string
    background?: string
    quietZone?: number
  }
}

/** 冻结快照（渲染器唯一消费物；递归只读） */
export interface PosterSpec {
  format: PosterFormat
  size: Readonly<PosterSize>
  themeId: string
  palette: Readonly<Omit<PosterTheme, 'name'>>
  content: Readonly<{
    headline: string
    subline: string
    facts: readonly Readonly<PosterFact>[]
    owner: string
    cta: string
  }>
  qr: Readonly<{
    url: string
    foreground: string
    background: string
    quietZone: number
  }>
}

export declare const POSTER_FORMATS: readonly PosterFormat[]
export declare const DEFAULT_FORMAT: PosterFormat
export declare const POSTER_SIZES: Readonly<Record<PosterFormat, Readonly<PosterSize>>>
export declare const DEFAULT_THEME_ID: string
export declare const POSTER_THEMES: Readonly<Record<string, Readonly<PosterTheme>>>
export declare const QR_DEFAULTS: Readonly<{ foreground: string; background: string; quietZone: number }>
export declare const DEFAULT_HEADLINE: string
export declare const DEFAULT_CTA: string

/** 业务输入 → 冻结快照（纯函数，非法入参返回兜底 spec） */
export declare function resolveSpec(input?: PosterSpecInput | unknown): Readonly<PosterSpec>

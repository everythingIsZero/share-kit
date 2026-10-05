/**
 * collect-signals.d.ts — 浏览器信号采集类型（手写声明，与 collect-signals.mjs 同步维护）
 */

/**
 * 采集到的原始信号。即 core `normalizeFingerprint` 的入参；字段可缺，缺了 core 判 unknown。
 */
export interface CollectedSignals {
  ua: string
  maxTouchPoints: number | undefined
  isSecureContext: boolean
  canShareFiles: boolean
  hasStandaloneDisplayMode: boolean
  hasDownloadAttr: boolean
  /** 取不到 `navigator.userActivation.isActive` 时为 `'unknown'`（不冒充 false） */
  hasTransientActivation: boolean | 'unknown'
}

/**
 * 采集原始信号（只读，不往宿主对象上挂/改任何属性）。
 * `win` 为类 window 对象，默认取全局对象。
 */
export declare function collectSignals(win?: unknown): CollectedSignals

/**
 * probe.d.ts — share-kit core 环境指纹归一类型（手写声明，与 probe.mjs 同步维护）
 */

import type { Container as ContainerKind, Fingerprint, OsKind } from './capability-table'

/** 浏览器内核（含未知档） */
export type EngineKind = 'wkwebview' | 'blink' | 'gecko' | 'u4' | 'unknown'

export declare const CONTAINER_VALUES: readonly ContainerKind[]
export declare const OS_VALUES: readonly OsKind[]
export declare const ENGINE_VALUES: readonly EngineKind[]

/** 参与指纹判定的维度（顺序即 unknown 数组顺序） */
export declare const FINGERPRINT_DIMENSIONS: readonly string[]

/** 版本带判定规则（只作修饰字段） */
export declare const VERSION_BAND_PATTERNS: Readonly<Record<string, RegExp>>

/**
 * 适配包采集的原始信号（全部可缺）
 *
 * ⚠️ 与运行时**必须同步**：`src/web/collect-signals.mjs`（采集侧产出）+ `src/core/*.mjs`（消费侧读取）
 * + `src/ui/mount.mjs`（按 artifact 给出 `hasFiles`/`hasDownloadSource`）。漏声明的后果是
 * **TS 消费站写对了也报类型错**——由 `test/meta/declaration-parity.test.mjs` 钉住（声明 ⊇ 运行时用到的键）。
 */
export interface RawSignals {
  ua?: string
  maxTouchPoints?: number
  isSecureContext?: boolean
  /**
   * 宿主有没有 `navigator.share`（**只回答存在性**）。
   * `share.system`（所有产物）与 `save.album` 都靠它入列：`false` 即否决——宿主没有系统分享接口时，
   * 列出来必点不动；带文件的 share 另需 `canShareFiles` + `hasFiles`。
   */
  hasShare?: boolean
  canShareFiles?: boolean
  hasStandaloneDisplayMode?: boolean
  hasDownloadAttr?: boolean
  hasTransientActivation?: boolean | 'unknown'
  /**
   * artifact 是否**真带文件**（适配包按实际产物给出，不是环境探测）。
   * `save.album` 与非 link 的 `share.system` 需 `hasFiles === true` 才入列——
   * `canShareFiles` 只是能力探测，不能替代「有文件」。
   */
  hasFiles?: boolean
  /**
   * artifact 是否**有下载源**（`files[0]` 或 `fileUrl`；适配包按实际产物给出）。
   * `save.download` 需它不是 `false` 才入列——空源在真实浏览器会下到**整页 HTML**；
   * 未传（旧调用方 / 首帧计划）不闸，保持既有行为。与 `hasFiles` 同口径。
   */
  hasDownloadSource?: boolean
}

/** 归一结果：脱敏指纹（进事件）+ 原始信号回显（不进事件） */
export interface NormalizeResult {
  fingerprint: Fingerprint
  signals: RawSignals
}

export declare function detectContainer(ua: string, signals?: RawSignals): ContainerKind
export declare function detectOs(ua: string, maxTouchPoints?: number): OsKind
export declare function detectEngine(ua: string, os: string): EngineKind
export declare function detectVersionBand(ua: string, os: string): string

/** 归一入口：纯函数，不改入参、无副作用 */
export declare function normalizeFingerprint(signals?: RawSignals | null): NormalizeResult
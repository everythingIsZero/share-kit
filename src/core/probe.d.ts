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

/** 适配包采集的原始信号（全部可缺） */
export interface RawSignals {
  ua?: string
  maxTouchPoints?: number
  isSecureContext?: boolean
  canShareFiles?: boolean
  hasStandaloneDisplayMode?: boolean
  hasDownloadAttr?: boolean
  hasTransientActivation?: boolean | 'unknown'
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
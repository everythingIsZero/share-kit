/**
 * capability-table.d.ts — share-kit core 环境能力表类型（手写声明，与 capability-table.mjs 同步维护）
 */

import type { ActionId } from './actions'

/** 证据等级（四级，R16） */
export type EvidenceLevel = '真机实测' | '模拟器或开发者工具' | '仅文档' | '未实测'

/** 置信度档位 */
export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'unknown'

/** 宿主容器（含「未知」档） */
export type Container =
  | 'wechat'
  | 'wechat-desktop'
  | 'wechat-miniprogram-webview'
  | 'douyin'
  | 'browser'
  | 'pwa-standalone'
  | 'unknown'

/** 操作系统（含「未知」档） */
export type OsKind = 'ios' | 'android' | 'macos' | 'windows' | 'harmony' | 'unknown'

/** 一格：某环境对某动作的可用性 */
export interface CapabilityCell {
  /** true 可用 / false 确定不可用 / null 未实测（不得填推测值） */
  available: boolean | null
  confidence: ConfidenceLevel
  evidence: EvidenceLevel
}

/** 环境键 `<container>:<os>` */
export type EnvKey = string

/** 脱敏环境指纹（维度值一律来自枚举） */
export interface Fingerprint {
  container: string
  os: string
  engine: string
  versionBand: string
  unknown: readonly string[]
}

export declare const EVIDENCE_LEVELS: readonly EvidenceLevel[]
export declare const CONFIDENCE_LEVELS: readonly ConfidenceLevel[]
export declare const CONTAINERS: readonly Container[]
export declare const OSES: readonly OsKind[]
export declare const UNKNOWN_ENV_KEY: EnvKey
export declare const ENV_KEYS: readonly EnvKey[]

/** 拼环境键 */
export declare function envKey(container: string, os: string): EnvKey

/** 能力表：环境键 → 六项动作的取值（42 格） */
export declare const CAPABILITY_TABLE: Readonly<Record<EnvKey, Readonly<Record<ActionId, CapabilityCell>>>>

/** 由指纹取环境键（维度缺失落 unknown 档） */
export declare function envKeyFor(fingerprint: unknown): EnvKey

/** 取一行能力表（指纹或环境键都可） */
export declare function capabilityRowFor(fingerprintOrKey: unknown): Readonly<Record<ActionId, CapabilityCell>>

/** 该格是否「确定可用」 */
export declare function isAvailable(cell: CapabilityCell | undefined | null): boolean

/** 整行是否全为未实测 */
export declare function isUntestedRow(row: Readonly<Record<ActionId, CapabilityCell>> | undefined | null): boolean
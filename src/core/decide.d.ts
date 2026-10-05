/**
 * decide.d.ts — share-kit core 动作决策类型（手写声明，与 decide.mjs 同步维护）
 */

import type { ActionId, ArtifactKind } from './actions'
import type { Fingerprint } from './capability-table'
import type { CopyTier } from './copy'
import type { RawSignals } from './probe'

/** 决策原因短码（机器可读） */
export type ReasonCode =
  | 'primary-available'
  | 'fallback-only'
  | 'unknown-env'
  | 'artifact-not-supported'
  | 'signal-gated'
  | 'signal-fallback'
  | 'no-artifact-kind'

/** 事前说明 */
export interface Hint {
  tier: CopyTier
  copyId: string
  params: Record<string, string>
}

/** 执行计划 */
export interface ExecutivePlan {
  /** 该环境唯一动作 */
  primary: ActionId
  /** 事前说明；null 表示该环境不需要额外说明 */
  hint: Hint | null
  /** 走不通时的兜底动作；primary 已是兜底时为 null */
  fallback: ActionId | null
  /** 机器可读原因短码 */
  reason: ReasonCode
}

export interface DecideInput {
  fingerprint?: Fingerprint | null
  artifactKind?: ArtifactKind | null
  /** 适配包采集的原始信号（可选，用于运行时否决） */
  signals?: RawSignals | null
}

export declare const FALLBACK_ACTION: 'copy.link'
export declare const UNCONDITIONAL_ACTIONS: readonly ActionId[]

/** 信号兜底表：表里给不出动作时，图片 / 视频靠运行时信号（探得到 a[download]）落下载 */
export declare const SIGNAL_FALLBACK: Readonly<Partial<Record<ArtifactKind, ActionId>>>

export declare const REASON_CODES: Readonly<Record<string, ReasonCode>>

/** 「操作与直觉不一致」的环境枚举（事前说明只在这些环境出现） */
export declare const INTUITIVE_CONFLICT_ENVS: readonly string[]

/** 事前提示表：`<环境键>|<产物种类>` → 文案 id */
export declare const PRE_HINTS: Readonly<Record<string, string>>

/** 中性说明文案 id（证据不足时唯一允许的提示） */
export declare const NEUTRAL_HINT_IDS: Readonly<Record<ArtifactKind, string>>

/** 产物偏好序 */
export declare const ARTIFACT_PREFERENCE: Readonly<Record<ArtifactKind, readonly ActionId[]>>

/** 产物动作闸：动作能不能带得动这种产物 */
export declare const ARTIFACT_ACTION_GATES: Readonly<Record<string, readonly ArtifactKind[]>>

/** 决策入口：纯函数，非法入参返回兜底计划 */
export declare function decideAction(input?: DecideInput | null): ExecutivePlan
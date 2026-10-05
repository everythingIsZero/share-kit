/**
 * outcome.d.ts — share-kit core 结果分类与事件类型（手写声明，与 outcome.mjs 同步维护）
 */

/** 结果四类 */
export type OutcomeKind = 'done' | 'cancelled' | 'blocked' | 'failed'

/** 反馈落点（恒为触发元素本身） */
export type FeedbackSurface = 'trigger'

/** 反馈强度 */
export type FeedbackSeverity = 'none' | 'info' | 'fail'

/** 反馈形态 */
export type FeedbackVisual = 'progress' | 'inline-guidance' | 'inline-result'

/** 反馈计划 */
export interface FeedbackPlan {
  surface: FeedbackSurface
  severity: FeedbackSeverity
  visual: FeedbackVisual
  /** 频率限制：null 表示不受限（失败与阻断必须每次都给） */
  counter: { scope: string; max: number } | null
}

/** 事件对象（固定四字段） */
export interface ShareEvent {
  probe: { primary?: string; reason?: string }
  action: string | null
  outcome: OutcomeKind
  fingerprint: Record<string, unknown>
}

export declare const OUTCOME_KINDS: readonly OutcomeKind[]
export declare const FEEDBACK_SURFACES: readonly FeedbackSurface[]
export declare const FEEDBACK_SEVERITIES: readonly FeedbackSeverity[]
export declare const FEEDBACK_VISUALS: readonly FeedbackVisual[]
export declare const EVENT_FIELDS: readonly string[]

/** 结果分类：错误对象 / 结果对象都可，非错误输入算成功 */
export declare function classifyOutcome(errorOrResult?: unknown): OutcomeKind

/** 反馈计划；`kind` 额外接受 `'running'`（已触发态） */
export declare function planFeedback(kind: OutcomeKind | 'running' | string): FeedbackPlan

/** 构造事件对象：只收指纹投影，原始信号不进事件 */
export declare function buildEvent(input?: {
  probe?: unknown
  action?: unknown
  outcome?: unknown
  fingerprint?: unknown
} | null): ShareEvent
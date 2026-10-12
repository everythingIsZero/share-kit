/**
 * feedback.d.ts — 结果 → 按钮反馈映射类型（手写声明，与 feedback.mjs 同步维护）
 */

import type { ExecuteResult } from './execute'

/** 反馈 tone 四档 */
export type FeedbackTone = 'busy' | 'guide' | 'ok' | 'fail'

/** 反馈 tone 枚举（只读） */
export declare const FEEDBACK_TONES: readonly FeedbackTone[]

/** 按钮反馈：tone 决定样式，text 为空表示只给图标、不宣称结果 */
export interface ButtonFeedback {
  tone: FeedbackTone
  text: string
}

/**
 * 结果 → `{ tone, text }`。`guidanceText` 为事前说明（core `plan.hint` 渲染产物）；
 * 引导类缺文案时回退 `fail-retry`。入参缺省或非法按失败处理，不抛错。
 */
export declare function feedbackOf(
  result:
    | Pick<ExecuteResult, 'ok' | 'outcome' | 'action' | 'mode'>
    | { ok?: boolean; outcome?: string; action?: string; mode?: string }
    | null
    | undefined,
  guidanceText?: string
): ButtonFeedback

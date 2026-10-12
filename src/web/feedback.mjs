/**
 * feedback.mjs — 结果 → 按钮反馈映射（SH-4 下沉）
 *
 * fang `lib/share-actions.ts` 的 `feedbackOf` 与 nuantie `lib/share/h5.ts` 的 `feedbackFor`
 * 是同一套「结果 → 按钮反馈」规则，此文件单源。消费方拿到 `executeAction` 的结果后直接调用：
 *
 * ```js
 * const fb = feedbackOf(result, hintTextOf(plan)) // { tone, text }
 * ```
 *
 * 规则（与红线 R7/R8/S11 对齐）：
 * - 引导类动作（`mode==='guidance'`）：给「下一步怎么做」，文案与事前说明同源，绝不报已完成；
 * - 只有**落点确定**的动作宣称结果——`save.download`（a[download] → 下载目录）、`copy.link`（剪贴板）；
 *   `save.album` / `share.system` 走系统面板，面板内发生了什么不可知，**不宣称结果**（空文案）；
 * - 用户取消（cancelled）：静默复原，不算失败；
 * - 被阻断（blocked）/ 失败 / 未知：给一步重试，不受频率限制。
 */

import { renderCopy } from '../core/index.mjs'

/** 反馈 tone 四档（消费方据此定样式；`busy` 由调用方在发起执行的瞬间自置，非本函数产出） */
export const FEEDBACK_TONES = Object.freeze(['busy', 'guide', 'ok', 'fail'])

/**
 * 结果 → `{ tone, text }`。
 * `guidanceText` 为事前说明（如 core `renderCopy(plan.hint.copyId, plan.hint.params)` 的产物）；
 * 引导类缺文案时回退 `fail-retry`（与既有站点实现同口径）。
 */
export function feedbackOf(result, guidanceText = '') {
  const r = result && typeof result === 'object' ? result : {}
  if (r.mode === 'guidance') return { tone: 'guide', text: guidanceText || renderCopy('fail-retry') }
  if (r.outcome === 'done') {
    if (r.action === 'save.download') return { tone: 'ok', text: renderCopy('done-saved') }
    if (r.action === 'copy.link') return { tone: 'ok', text: renderCopy('done-copied') }
    return { tone: 'ok', text: '' }
  }
  if (r.outcome === 'cancelled') return { tone: 'ok', text: '' }
  return { tone: 'fail', text: renderCopy('fail-retry') }
}

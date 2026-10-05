/**
 * outcome.mjs — 结果分类与反馈口径（R9、R12、R17）
 *
 * 三件事：
 * 1. `classifyOutcome` 把执行结果分成四类：成功 / 用户取消 / 被阻断 / 失败；
 * 2. `planFeedback` 给出「反馈落在哪、什么形态」的计划——落点恒为触发元素本身，不用浮层提示；
 * 3. `buildEvent` 产出固定四字段的事件对象，只收指纹投影，**不收原始信号**（R17）。
 *
 * 红线（R12）：本模块不导出任何发放权益的入口，也不建任何存储；分享结果只做归因。
 */

/** 结果四类 */
export const OUTCOME_KINDS = Object.freeze(['done', 'cancelled', 'blocked', 'failed'])

/** 反馈落点：只有「触发元素本身」一种（R9，不弹浮层） */
export const FEEDBACK_SURFACES = Object.freeze(['trigger'])

/** 反馈强度 */
export const FEEDBACK_SEVERITIES = Object.freeze(['none', 'info', 'fail'])

/** 反馈形态：已触发态（进度）/ 一步引导 / 结果落按钮 */
export const FEEDBACK_VISUALS = Object.freeze(['progress', 'inline-guidance', 'inline-result'])

/** 事件固定四字段（R17：探测结论 / 实际执行与结果 / 环境指纹） */
export const EVENT_FIELDS = Object.freeze(['probe', 'action', 'outcome', 'fingerprint'])

/** 指纹投影白名单：只留脱敏维度，其余键（含 ua 原文、任何身份字段）一律丢弃 */
const FINGERPRINT_FIELDS = Object.freeze(['container', 'os', 'engine', 'versionBand', 'unknown'])

/** 探测结论投影白名单 */
const PROBE_FIELDS = Object.freeze(['primary', 'reason'])

/** 错误名 → 结果分类（用户取消与真失败必须分开归因，R17） */
const ERROR_NAME_MAP = Object.freeze({
  AbortError: 'cancelled',
  NotAllowedError: 'blocked',
})

/**
 * 结果分类。入参可以是错误对象、`{ ok: true }` 这类结果对象，或 `{ ok: false, error }`。
 * 非错误的一切输入都算成功——本函数只回答「这次执行的结果属于哪一类」。
 */
export function classifyOutcome(errorOrResult) {
  if (!errorOrResult || typeof errorOrResult !== 'object') return 'done'
  if (errorOrResult.ok === false) return classifyOutcome(errorOrResult.error)
  const error = errorOrResult.error || (errorOrResult instanceof Error ? errorOrResult : null)
  if (!error) return 'done'
  const name = typeof error.name === 'string' ? error.name : ''
  return ERROR_NAME_MAP[name] || 'failed'
}

/**
 * 反馈计划。落点恒为触发元素（R9）：
 * - 已触发态：禁用 + 进度指示，不改文案、不弹任何东西（R6 点按时）；
 * - 成功：结果落在按钮上，同一会话只提示一次（避免反复打扰）；
 * - 用户取消：静默复原，不算失败；
 * - 被阻断 / 失败：给一步引导，**不受「每会话一次」频率限制**（R9）。
 */
export function planFeedback(kind) {
  switch (kind) {
    case 'running':
      return { surface: 'trigger', severity: 'none', visual: 'progress', counter: null }
    case 'done':
      return { surface: 'trigger', severity: 'info', visual: 'inline-result', counter: { scope: 'session', max: 1 } }
    case 'cancelled':
      return { surface: 'trigger', severity: 'none', visual: 'inline-result', counter: null }
    case 'blocked':
    case 'failed':
      return { surface: 'trigger', severity: 'fail', visual: 'inline-guidance', counter: null }
    default:
      // 未知结果按失败处理：宁可多给一次引导，也不假装成功
      return { surface: 'trigger', severity: 'fail', visual: 'inline-guidance', counter: null }
  }
}

/** 只取白名单字段，其余键一律丢弃 */
function project(source, fields) {
  const src = source && typeof source === 'object' ? source : {}
  const out = {}
  for (const key of fields) {
    if (src[key] !== undefined) out[key] = src[key]
  }
  return out
}

/**
 * 事件对象（R17）。只接收指纹投影：若误传整份归一结果（含原始信号），本函数会自动取出其中的
 * 指纹并丢弃信号——UA 原文、任何身份字段都不进事件。
 */
export function buildEvent(input) {
  const src = input && typeof input === 'object' ? input : {}
  const fpArg = src.fingerprint
  // 误传整份归一结果（含原始信号）时自动取出其中的指纹投影，信号丢弃
  const fpSource =
    fpArg && typeof fpArg === 'object' && fpArg.fingerprint && typeof fpArg.fingerprint === 'object'
      ? fpArg.fingerprint
      : fpArg
  return {
    probe: project(src.probe, PROBE_FIELDS),
    action: typeof src.action === 'string' ? src.action : null,
    outcome: OUTCOME_KINDS.includes(src.outcome) ? src.outcome : 'failed',
    fingerprint: project(fpSource, FINGERPRINT_FIELDS),
  }
}
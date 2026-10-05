/**
 * execute.mjs — 动作执行（R14 的落点）
 *
 * 红线（R14）：点击回调里必须**同步**调用注入的实现，`await` 只允许出现在调用之后——
 * 任何先 `await` 再调用的写法都会烧掉一次性用户激活，iOS 上直接 NotAllowedError。
 * 本文件把「发起调用」与「等待结果」拆成两段：`invoke` 是纯同步段，`settle` 才碰 Promise。
 *
 * 本包不做决策：执行哪个动作由调用方按 core 的执行计划传进来。
 */

import { classifyOutcome } from '../core/index.mjs'

/** 动作 → 依赖键的映射；值为 null 表示「引导类动作」，不需要外部调用 */
export const ACTION_DEP_MAP = Object.freeze({
  'share.system': 'share',
  'share.card.wx': null,
  'share.card.miniapp': null,
  'save.album': 'download',
  'copy.link': 'copy',
  'preview.longpress': null,
})

/** 引导类动作：由界面给出一步引导，不调用任何外部实现 */
export const GUIDANCE_ACTIONS = Object.freeze(['preview.longpress', 'share.card.wx', 'share.card.miniapp'])

/** 调用注入实现（**同步段**：这里绝不能出现 await） */
function invoke(actionId, deps) {
  const depKey = ACTION_DEP_MAP[actionId]
  if (depKey === undefined) throw new TypeError(`未知动作：${actionId}`)
  if (depKey === null) return undefined
  const fn = deps[depKey]
  if (typeof fn !== 'function') throw new TypeError(`动作 ${actionId} 缺少注入实现：${depKey}`)
  if (depKey === 'share') return fn({ files: deps.files, url: deps.url, title: deps.title, text: deps.text })
  if (depKey === 'download') return fn({ url: deps.url, files: deps.files, filename: deps.filename })
  return fn(deps.url)
}

/** 结果归一：错误一律转成四类结果之一，不向上抛 */
function toResult(actionId, error) {
  const outcome = classifyOutcome(error)
  return {
    ok: false,
    outcome,
    action: actionId,
    mode: 'invoked',
    error: error instanceof Error ? error : new Error(String(error)),
  }
}

/**
 * 执行一个动作。`deps` 为注入实现：`{ share, copy, download, openExternal, url, files, title, text }`。
 *
 * `openExternal` 是「去外部浏览器」引导按钮的注入点：本函数**不会自动调用它**——
 * 自动跳浏览器会打断用户，是否提供这一步由调用方接线。
 *
 * 返回 `{ ok, outcome, action, mode }`；`mode` 为 'invoked'（调用了注入实现）或 'guidance'（只给引导）。
 */
export function executeAction(actionId, deps) {
  const d = deps && typeof deps === 'object' ? deps : {}
  let pending
  try {
    pending = invoke(actionId, d) // 同步段结束前，调用已经发出
  } catch (error) {
    return Promise.resolve(toResult(actionId, error))
  }
  const mode = GUIDANCE_ACTIONS.includes(actionId) ? 'guidance' : 'invoked'
  // 此后才允许 await：结果 settle 与成败分类都在这里完成
  return Promise.resolve(pending).then(
    () => ({ ok: true, outcome: 'done', action: actionId, mode }),
    (error) => toResult(actionId, error)
  )
}
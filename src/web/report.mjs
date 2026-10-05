/**
 * report.mjs — 事件上报（R17）
 *
 * 上报是**尽力而为**：发送失败、抛错、网络挂掉都不影响用户动作，也不重试。
 * 事件对象统一由 core 的 `buildEvent` 构造，字段受控为四项（探测结论 / 动作 / 结果 / 指纹投影），
 * 调用方多传的键（含原始信号）会被丢掉。
 */

import { buildEvent } from '../core/index.mjs'

function noop() {}

/**
 * 造一个上报器。`send` 为注入的发送实现（可以是同步函数，也可以返回 Promise）。
 * 返回 `{ send(event) }`：同步返回、不抛错、不重试。
 */
export function createReporter(send) {
  const sink = typeof send === 'function' ? send : noop
  return {
    send(input) {
      const event = buildEvent(input)
      try {
        const pending = sink(event)
        if (pending && typeof pending.then === 'function') pending.then(noop, noop)
      } catch {
        // fire-and-forget：上报失败不冒泡到用户动作
      }
      return undefined
    },
  }
}
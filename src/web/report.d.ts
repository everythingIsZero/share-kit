/**
 * report.d.ts — 事件上报类型（手写声明，与 report.mjs 同步维护）
 */

import type { ShareEvent } from '../core/index'

export interface Reporter {
  /** 同步返回、不抛错、不重试（fire-and-forget） */
  send(input?: unknown): undefined
}

/**
 * 造一个上报器。`send` 为注入的发送实现，可以是同步函数或返回 Promise。
 * 事件对象由 core `buildEvent` 构造，字段固定四项；调用方多传的键（含原始信号）会被丢掉。
 */
export declare function createReporter(send?: ((event: ShareEvent) => unknown) | null): Reporter

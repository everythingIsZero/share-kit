/**
 * execute.d.ts — 动作执行类型（手写声明，与 execute.mjs 同步维护）
 */

import type { ActionId, OutcomeKind } from '../core/index'

/** 动作 → 注入依赖键；null 表示引导类动作（不调用外部实现） */
export declare const ACTION_DEP_MAP: Readonly<Record<ActionId, string | null>>

/** 引导类动作清单 */
export declare const GUIDANCE_ACTIONS: readonly ActionId[]

/** 注入实现与产物入参 */
export interface ExecuteDeps {
  /** 系统分享 / 平台分享入口 */
  share?: (payload: { files?: unknown; url?: string; title?: string; text?: string }) => unknown
  /** 复制链接 */
  copy?: (text: string) => unknown
  /** 直接下载 */
  download?: (payload: { url?: string; files?: unknown; filename?: string }) => unknown
  /**
   * 「去外部浏览器」引导按钮的注入点。本函数**不会自动调用它**——
   * 自动跳浏览器会打断用户，是否提供这一步由调用方接线。
   */
  openExternal?: () => unknown
  url?: string
  files?: unknown
  title?: string
  text?: string
  filename?: string
}

/** 执行结果 */
export interface ExecuteResult {
  ok: boolean
  outcome: OutcomeKind
  action: ActionId
  /** 'invoked' 调用了注入实现；'guidance' 只给一步引导 */
  mode: 'invoked' | 'guidance'
  error?: Error
}

/**
 * 执行动作。内部**先同步调用**注入实现、**后 await**（R14）：
 * 点击回调里直接调用本函数即可，调用方不得在它之前 `await` 任何东西。
 */
export declare function executeAction(actionId: ActionId, deps?: ExecuteDeps | null): Promise<ExecuteResult>

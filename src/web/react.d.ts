/**
 * react.d.ts — React 绑定类型（手写声明，与 react.mjs 同步维护）
 *
 * 本包无构建步：**只能用 `React.createElement`，不能写 JSX**。
 */

import type { ComponentType, CSSProperties } from 'react'
import type { ActionId, ExecutivePlan, OutcomeKind, ShareEvent } from '../core/index'

import type { ExecuteDeps } from './execute'
import type { Reporter } from './report'

/** 引导层与边缘的间距 */
export declare const OVERLAY_GAP: number

/** 触发态初始视图 */
export declare const IDLE_VIEW: TriggerView

/** 触发态视图 */
export interface TriggerView {
  status: 'idle' | 'running' | 'done' | 'failed'
  disabled: boolean
  visual: 'progress' | 'inline-guidance' | 'inline-result' | null
  severity: 'none' | 'info' | 'fail'
}

/** 归约事件 */
export type TriggerEvent =
  | { type: 'click' }
  | { type: 'reset' }
  | { type: 'settle'; outcome: OutcomeKind }
  | { type: OutcomeKind }

/** 安全区（可缺边） */
export interface SafeArea {
  top?: number
  bottom?: number
  left?: number
  right?: number
}

/**
 * 引导层位置：由安全区与容器 UI 高度算出，不写死任何坐标。
 * `containerUiHeight` 传数字 = 底部占位（如 tabBar）；传对象可分别给上下两侧。
 */
export declare function computeOverlayPosition(
  safeArea?: SafeArea | null,
  containerUiHeight?: number | { top?: number; bottom?: number } | null
): { top: number; bottom: number; left: number; right: number }

/** 触发态归约（纯函数） */
export declare function reduceTrigger(state: TriggerView | string | null, event?: TriggerEvent | null): TriggerView

export interface ShareTriggerProps {
  label?: string
  plan?: ExecutivePlan | null
  deps?: ExecuteDeps
  reporter?: Reporter | null
  fingerprint?: Record<string, unknown>
  guidanceCopyId?: string
  className?: string
  style?: CSSProperties
}

/** 分享 / 保存按钮（薄组件，按钮恒直出） */
export declare const ShareTrigger: ComponentType<ShareTriggerProps>

export type { ActionId, ShareEvent }

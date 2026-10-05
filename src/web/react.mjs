/**
 * react.mjs — React 绑定（薄组件 + 纯函数）
 *
 * 分两层：
 * - **纯函数层**：`computeOverlayPosition`（引导层位置按安全区与容器 UI 高度动态算）与
 *   `reduceTrigger`（触发态归约）——都进 node:test，不需要浏览器；
 * - **组件层**：`ShareTrigger`，只做接线（按钮 → 执行 → 反馈落在按钮上）。
 *
 * 本包无构建步，因此**只能用 `React.createElement`，不能写 JSX**。React 是可选 peer：
 * 只要不 import 本子路径，`share-kit/web` 主入口不会拉起 React。
 *
 * 红线：按钮恒直出（R5），不存在「该环境没有可用动作就不渲染」的分支——没有动作时点击走引导。
 */

import * as React from 'react'
import { FALLBACK_ACTION, planFeedback, renderCopy } from '../core/index.mjs'

import { executeAction } from './execute.mjs'

/** 引导层与边缘的间距（唯一常量；其余坐标全部由安全区与容器 UI 高度算出） */
export const OVERLAY_GAP = 8

/** 触发态初始值 */
export const IDLE_VIEW = Object.freeze({ status: 'idle', disabled: false, visual: null, severity: 'none' })

/** 计划缺失时的兜底（按钮仍直出，点击走复制链接） */
const SAFE_PLAN = Object.freeze({ primary: FALLBACK_ACTION, hint: null, fallback: null, reason: 'no-artifact-kind' })

/**
 * 引导层位置：`safeArea` 为安全区内缩（top/bottom/left/right），`containerUiHeight` 为容器自身
 * UI 高度（数字 = 底部占位，如 tabBar；也可传 `{ top, bottom }` 分别给上下两侧）。
 * 不写死任何坐标：所有值都由入参与 OVERLAY_GAP 算出。
 */
export function computeOverlayPosition(safeArea, containerUiHeight) {
  const sa = safeArea && typeof safeArea === 'object' ? safeArea : {}
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  const ui =
    containerUiHeight && typeof containerUiHeight === 'object'
      ? { top: num(containerUiHeight.top), bottom: num(containerUiHeight.bottom) }
      : { top: 0, bottom: num(containerUiHeight) }

  return {
    top: num(sa.top) + ui.top + OVERLAY_GAP,
    bottom: num(sa.bottom) + ui.bottom + OVERLAY_GAP,
    left: num(sa.left) + OVERLAY_GAP,
    right: num(sa.right) + OVERLAY_GAP,
  }
}

/** 由 core 的反馈计划造视图状态 */
function viewOf(status, feedback) {
  return { status, disabled: feedback.visual === 'progress', visual: feedback.visual, severity: feedback.severity }
}

/** 状态 → 视图（未知事件时按当前状态回显，不改状态） */
const STATUS_VIEW = Object.freeze({
  idle: IDLE_VIEW,
  running: viewOf('running', planFeedback('running')),
  done: viewOf('done', planFeedback('done')),
  failed: viewOf('failed', planFeedback('failed')),
})

/**
 * 触发态归约（纯函数）。`state` 可以是状态字符串或上一次的视图对象。
 * - `{ type: 'click' }`：进入已触发态（禁用 + 进度指示，不改文案、不弹任何东西）；重复点击保持原状；
 * - `{ type: 'settle', outcome }` 或 `{ type: 'done' | 'fail' | 'blocked' | 'cancelled' }`：按结果落反馈；
 * - `{ type: 'reset' }`：复原（组件卸载时必须派发，防残留禁用态）。
 */
export function reduceTrigger(state, event) {
  const status = typeof state === 'string' ? state : state && typeof state === 'object' ? state.status : 'idle'
  const type = event && typeof event === 'object' ? event.type : null

  if (type === 'click') return viewOf('running', planFeedback('running'))
  if (type === 'reset') return { ...IDLE_VIEW }

  const outcome = type === 'settle' ? event.outcome : type
  if (outcome === 'done') return viewOf('done', planFeedback('done'))
  if (outcome === 'cancelled') return { ...IDLE_VIEW, severity: planFeedback('cancelled').severity }
  // 'fail' 是 'failed' 的简写：两者都给一步引导（planFeedback 对未知结果也按失败处理）
  if (outcome === 'fail' || outcome === 'failed' || outcome === 'blocked') return viewOf('failed', planFeedback(outcome))

  // 未知事件：按当前状态回显
  return STATUS_VIEW[status] || IDLE_VIEW
}

/**
 * 分享 / 保存按钮（薄组件）。
 *
 * props:
 * - `label` 按钮文案；
 * - `plan` core 的执行计划（调用方用 `decideAction` 算好后传入）；
 * - `deps` 注入实现（见 `executeAction`）；
 * - `reporter` 可选，`createReporter` 的产物；
 * - `fingerprint` 可选，core 归一后的指纹投影（进事件）；
 * - `guidanceCopyId` 可选，失败时一步引导的文案 id（默认 `fail-retry`）；
 * - `className` / `style` 透传。
 */
export function ShareTrigger(props) {
  const { label = '分享', plan, deps, reporter, fingerprint, guidanceCopyId, className, style } = props
  const activePlan = plan && plan.primary ? plan : SAFE_PLAN
  const [view, setView] = React.useState(IDLE_VIEW)
  const dispatch = React.useCallback((event) => setView((prev) => reduceTrigger(prev, event)), [])

  const handleClick = React.useCallback(() => {
    dispatch({ type: 'click' })
    // executeAction 内部先同步调用、后 await（R14）；这里只负责落反馈与上报
    Promise.resolve(executeAction(activePlan.primary, deps)).then((result) => {
      dispatch({ type: 'settle', outcome: result.outcome })
      if (reporter && typeof reporter.send === 'function') {
        reporter.send({
          probe: { primary: activePlan.primary, reason: activePlan.reason },
          action: result.action,
          outcome: result.outcome,
          fingerprint,
        })
      }
    })
  }, [activePlan, deps, reporter, fingerprint, dispatch])

  // 卸载即复原：不残留禁用态
  React.useEffect(() => () => dispatch({ type: 'reset' }), [dispatch])

  const hintText = activePlan.hint ? renderCopy(activePlan.hint.copyId, activePlan.hint.params) : ''
  const guidanceText = view.visual === 'inline-guidance' ? renderCopy(guidanceCopyId || 'fail-retry') : ''

  return React.createElement(
    'div',
    { className, style },
    // 按钮恒直出：没有「无可用动作就不渲染」的分支（R5）
    React.createElement(
      'button',
      {
        type: 'button',
        onClick: handleClick,
        disabled: view.disabled,
        'aria-busy': view.visual === 'progress' ? 'true' : undefined,
      },
      label
    ),
    hintText ? React.createElement('span', { className: 'share-hint' }, hintText) : null,
    guidanceText ? React.createElement('span', { className: 'share-guidance' }, guidanceText) : null
  )
}
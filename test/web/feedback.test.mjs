/**
 * feedback.test.mjs — 结果 → 按钮反馈映射（SH-4）
 *
 * 从 fang `share-actions.ts` 的 `feedbackOf` 口径收敛（nuantie `share/h5.ts` 的 `feedbackFor` 与 fang 不同：
 * 曾对 `save.album` 宣称 `done-saved`、引导缺文案返回空串；本包按 R7 去掉）：
 * 结果（`ExecuteResult`）→ `{ tone, text }` 单源在包内。判定作用（与红线 R7/R8/S11 对齐）：
 *   - 引导类动作给引导文案，绝不报「已完成」；
 *   - 只有落点确定的动作（save.download / copy.link）才宣称结果，走系统面板的不宣称；
 *   - 用户取消静默复原（不算失败）；被阻断 / 失败给一步重试。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { feedbackOf, FEEDBACK_TONES } from '../../src/web/feedback.mjs'
import { renderCopy } from '../../src/core/index.mjs'

const result = (over) => ({ ok: true, outcome: 'done', action: 'share.system', mode: 'invoked', ...over })

test('FEEDBACK_TONES 受控为四档', () => {
  assert.deepEqual([...FEEDBACK_TONES], ['busy', 'guide', 'ok', 'fail'])
  assert.equal(Object.isFrozen(FEEDBACK_TONES), true)
})

test('引导类动作：给引导文案（tone guide）；缺引导文案时回退一步重试，绝不报已完成', () => {
  const r = result({ mode: 'guidance', outcome: 'guidance', action: 'share.card.wx' })
  assert.deepEqual(feedbackOf(r, '点右上角发给朋友'), { tone: 'guide', text: '点右上角发给朋友' })
  const fallback = feedbackOf(r, '')
  assert.equal(fallback.tone, 'guide')
  assert.equal(fallback.text, renderCopy('fail-retry'))
  assert.notEqual(fallback.text, renderCopy('done-copied'))
})

test('done + save.download（落点确定）：报「已保存到本机」', () => {
  assert.deepEqual(feedbackOf(result({ action: 'save.download' }), ''), {
    tone: 'ok',
    text: renderCopy('done-saved'),
  })
})

test('done + copy.link：报「链接已复制」', () => {
  assert.deepEqual(feedbackOf(result({ action: 'copy.link' }), ''), {
    tone: 'ok',
    text: renderCopy('done-copied'),
  })
})

test('done + 走系统面板的动作（save.album / share.system）：不宣称结果（空文案）', () => {
  for (const action of ['save.album', 'share.system']) {
    const fb = feedbackOf(result({ action }), '')
    assert.equal(fb.tone, 'ok')
    assert.equal(fb.text, '', `${action} 走系统面板，面板内发生了什么不可知（R7），不得宣称结果`)
    assert.notEqual(fb.text, renderCopy('done-saved'))
    assert.notEqual(fb.text, renderCopy('done-copied'))
  }
})

test('用户取消：静默复原（tone ok、空文案，不算失败）', () => {
  assert.deepEqual(feedbackOf(result({ ok: false, outcome: 'cancelled' }), ''), { tone: 'ok', text: '' })
})

test('被阻断 / 失败 / 未知结果：给一步重试（tone fail）', () => {
  for (const outcome of ['blocked', 'failed', 'weird']) {
    const fb = feedbackOf(result({ ok: false, outcome }), '')
    assert.equal(fb.tone, 'fail', `${outcome} 应判失败档`)
    assert.equal(fb.text, renderCopy('fail-retry'))
  }
  // 空入参不抛错，按失败处理（宁可多给一次引导，也不假装成功）
  assert.deepEqual(feedbackOf(null, ''), { tone: 'fail', text: renderCopy('fail-retry') })
})

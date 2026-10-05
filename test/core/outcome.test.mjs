/**
 * tests/outcome.test.mjs — 结果分类与反馈口径（node:test，零依赖）
 * 覆盖 Unit 4 的 9 条：四类分类 / 反馈落点 / 事件四字段 / 指纹脱敏 / 无权益入口 / 取消不计失败
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  EVENT_FIELDS,
  FEEDBACK_SURFACES,
  FEEDBACK_SEVERITIES,
  FEEDBACK_VISUALS,
  OUTCOME_KINDS,
  buildEvent,
  classifyOutcome,
  planFeedback,
} from '../../src/core/outcome.mjs'
import * as core from '../../src/core/index.mjs'
import { normalizeFingerprint } from '../../src/core/probe.mjs'
import { decideAction } from '../../src/core/decide.mjs'

/** 造一个带名字的错误 */
function err(name, message = '') {
  return Object.assign(new Error(message), { name })
}

test('AbortError 判用户取消（不计失败）', () => {
  assert.equal(classifyOutcome(err('AbortError', 'cancelled')), 'cancelled')
  assert.equal(classifyOutcome({ ok: false, error: err('AbortError') }), 'cancelled')
})

test('NotAllowedError 判被阻断', () => {
  assert.equal(classifyOutcome(err('NotAllowedError')), 'blocked')
  assert.equal(classifyOutcome({ ok: false, error: err('NotAllowedError') }), 'blocked')
})

test('TypeError 判失败', () => {
  assert.equal(classifyOutcome(err('TypeError', 'boom')), 'failed')
  assert.equal(classifyOutcome(new Error('net down')), 'failed')
})

test('无错误即成功；非法入参也算成功（不抛错）', () => {
  assert.equal(classifyOutcome({ ok: true }), 'done')
  assert.equal(classifyOutcome({}), 'done')
  assert.equal(classifyOutcome(null), 'done')
  assert.equal(classifyOutcome(undefined), 'done')
  assert.equal(classifyOutcome('oops'), 'done')
})

test('反馈落在按钮上：三类结果的 surface 都是 trigger，且都不含浮层提示字段', () => {
  for (const kind of ['done', 'failed', 'cancelled', 'blocked']) {
    const plan = planFeedback(kind)
    assert.equal(plan.surface, 'trigger')
    assert.equal(Object.prototype.hasOwnProperty.call(plan, 'toast'), false)
    assert.ok(FEEDBACK_SURFACES.includes(plan.surface))
    assert.ok(FEEDBACK_SEVERITIES.includes(plan.severity))
    assert.ok(FEEDBACK_VISUALS.includes(plan.visual))
  }
  assert.equal(planFeedback('done').visual, 'inline-result')
  assert.equal(planFeedback('failed').visual, 'inline-guidance')
  assert.equal(planFeedback('running').visual, 'progress')
})

test('事件字段恰好四项', () => {
  const event = buildEvent({
    probe: { primary: 'share.system', reason: 'primary-available', extra: '不该出现' },
    action: 'share.system',
    outcome: 'done',
    fingerprint: { container: 'browser', os: 'ios', engine: 'wkwebview', versionBand: 'ios-17', unknown: [] },
  })
  assert.deepEqual(Object.keys(event).sort(), ['action', 'fingerprint', 'outcome', 'probe'])
  assert.deepEqual(Object.keys(event).sort(), [...EVENT_FIELDS].sort())
  assert.deepEqual(Object.keys(event.probe).sort(), ['primary', 'reason'], '探测结论只留两个字段')
})

test('指纹不带敏感字段：误传整份归一结果也只留脱敏维度', () => {
  const normalized = normalizeFingerprint({
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Mobile/15E148 MicroMessenger/8.0.50',
    maxTouchPoints: 5,
    userId: 'u-123456',
    ip: '203.0.113.7',
  })
  const event = buildEvent({
    probe: decideAction({ fingerprint: normalized.fingerprint, artifactKind: 'image' }),
    action: 'preview.longpress',
    outcome: 'done',
    fingerprint: normalized, // 故意误传整份归一结果
  })
  const serialized = JSON.stringify(event)
  assert.equal(serialized.includes('MicroMessenger'), false, 'UA 原文不得进事件')
  assert.equal(serialized.includes('u-123456'), false, '身份字段不得进事件')
  assert.equal(serialized.includes('203.0.113.7'), false, 'IP 形态串不得进事件')
  assert.equal(Object.prototype.hasOwnProperty.call(event, 'signals'), false, '原始信号不得进事件')
  assert.deepEqual(Object.keys(event.fingerprint).sort(), ['container', 'engine', 'os', 'unknown', 'versionBand'])
  assert.equal(event.fingerprint.container, 'wechat')

  // 直接给投影也照样只留白名单字段
  const projected = buildEvent({ fingerprint: { container: 'browser', ua: 'raw-ua', ip: '10.0.0.1' }, action: 'copy.link', outcome: 'done' })
  assert.deepEqual(Object.keys(projected.fingerprint), ['container'])
})

test('事件兜底：结果越界记失败、动作缺失记 null，不抛错', () => {
  const event = buildEvent({ outcome: 'weird' })
  assert.equal(event.outcome, 'failed')
  assert.equal(event.action, null)
  assert.deepEqual(event.probe, {})
  assert.deepEqual(event.fingerprint, {})
  assert.equal(buildEvent().outcome, 'failed')
})

test('无权益入口：导出的名字里不含 grant / reward / claim', () => {
  for (const name of Object.keys(core)) {
    assert.equal(/grant|reward|claim/i.test(name), false, `导出名 ${name} 触碰权益红线`)
  }
  const src = readFileSync(new URL('../../src/core/outcome.mjs', import.meta.url), 'utf8')
  assert.equal(/grant|reward|claim/i.test(src), false, 'outcome.mjs 不得出现权益相关字样')
})

test('取消不计失败：severity 为 none，且分类枚举完整', () => {
  assert.equal(planFeedback('cancelled').severity, 'none')
  assert.equal(planFeedback('done').severity, 'info')
  assert.equal(planFeedback('failed').severity, 'fail')
  assert.deepEqual([...OUTCOME_KINDS], ['done', 'cancelled', 'blocked', 'failed'])
})
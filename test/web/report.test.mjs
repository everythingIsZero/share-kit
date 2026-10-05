/**
 * report.test.mjs — 事件上报（Unit 5 场景 8-9）
 *
 * 上报是 fire-and-forget：失败不冒泡、不重试；字段受控为固定四项。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createReporter } from '../../src/web/report.mjs'

test('上报失败不抛且只调一次：发送实现抛错被吞掉', () => {
  let calls = 0
  const reporter = createReporter(() => {
    calls += 1
    throw new Error('net')
  })
  assert.doesNotThrow(() => {
    reporter.send({ probe: { primary: 'copy.link' }, action: 'copy.link', outcome: 'done', fingerprint: {} })
  })
  assert.equal(calls, 1) // fire-and-forget，不重试
})

test('上报字段受控：send 收到的对象键恰为四项，多传的键被丢弃', () => {
  let received = null
  const reporter = createReporter((event) => {
    received = event
  })
  reporter.send({
    probe: { primary: 'share.system', reason: 'primary-available' },
    action: 'share.system',
    outcome: 'done',
    fingerprint: { container: 'browser', os: 'ios' },
    signals: { ua: 'raw-ua-should-be-dropped' }, // 原始信号不得进事件
    userId: 'should-be-dropped',
  })
  assert.deepEqual(Object.keys(received).sort(), ['action', 'fingerprint', 'outcome', 'probe'])
  assert.equal(received.fingerprint.ua, undefined)
  assert.equal(received.userId, undefined)
})

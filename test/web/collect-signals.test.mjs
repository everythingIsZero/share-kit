/**
 * collect-signals.test.mjs — 浏览器信号采集（Unit 5 场景 1-4）
 *
 * 用假 window 对象覆盖：采集过程只读不写，缺字段不炸，抛错不影响其它字段。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { collectSignals } from '../../src/web/collect-signals.mjs'

test('信号采集只读不写：返回八项信号，且假 window 未被新增或改写属性', () => {
  const fake = {
    navigator: { userAgent: 'x', canShare: () => true, share: () => {} },
    matchMedia: () => ({ matches: true }),
  }
  const keysBefore = Object.keys(fake)
  const navKeysBefore = Object.keys(fake.navigator)
  const matchMediaRef = fake.matchMedia

  const signals = collectSignals(fake)

  for (const key of [
    'ua',
    'maxTouchPoints',
    'isSecureContext',
    'hasShare',
    'canShareFiles',
    'hasStandaloneDisplayMode',
    'hasDownloadAttr',
    'hasTransientActivation',
  ]) {
    assert.ok(key in signals, `缺少信号字段：${key}`)
  }
  assert.equal(signals.ua, 'x')
  assert.equal(signals.hasStandaloneDisplayMode, true) // matchMedia 命中 standalone
  assert.equal(signals.hasShare, true) // navigator.share 存在

  // 宿主对象未被新增或改写
  assert.deepEqual(Object.keys(fake), keysBefore)
  assert.deepEqual(Object.keys(fake.navigator), navKeysBefore)
  assert.equal(fake.matchMedia, matchMediaRef)
  assert.equal(fake.navigator.userAgent, 'x')
})

test('canShare 抛错不影响采集：canShareFiles 记 false 且不抛出', () => {
  const fake = {
    navigator: {
      userAgent: 'y',
      canShare: () => {
        throw new TypeError('boom')
      },
    },
  }
  let signals
  assert.doesNotThrow(() => {
    signals = collectSignals(fake)
  })
  assert.equal(signals.canShareFiles, false)
  assert.equal(signals.ua, 'y') // 其它字段照常采集
})

test('缺字段不炸：空对象输入时所有字段是可判定的空值', () => {
  let signals
  assert.doesNotThrow(() => {
    signals = collectSignals({})
  })
  assert.equal(signals.ua, '')
  assert.equal(signals.maxTouchPoints, undefined)
  assert.equal(signals.isSecureContext, false)
  assert.equal(signals.hasShare, false)
  assert.equal(signals.canShareFiles, false)
  assert.equal(signals.hasStandaloneDisplayMode, false)
  assert.equal(signals.hasDownloadAttr, false)
  assert.equal(signals.hasTransientActivation, 'unknown')
})

test('transient activation 采集：有 userActivation 取布尔，缺失记 unknown', () => {
  const active = collectSignals({ navigator: { userActivation: { isActive: true } } })
  assert.equal(active.hasTransientActivation, true)

  const inactive = collectSignals({ navigator: { userActivation: { isActive: false } } })
  assert.equal(inactive.hasTransientActivation, false)

  const missing = collectSignals({ navigator: {} })
  assert.equal(missing.hasTransientActivation, 'unknown')
})

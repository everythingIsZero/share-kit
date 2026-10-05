/**
 * tests/capability-table.test.mjs — 环境能力表边界（node:test，零依赖）
 * 覆盖 Unit 1 第 5、6、7 条：环境键是有限清单 / 证据等级合法 / 仅文档与未实测的取值规则
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { ACTION_IDS } from '../../src/core/actions.mjs'
import {
  CAPABILITY_TABLE,
  CONFIDENCE_LEVELS,
  CONTAINERS,
  EVIDENCE_LEVELS,
  ENV_KEYS,
  OSES,
  UNKNOWN_ENV_KEY,
  capabilityRowFor,
  envKey,
  envKeyFor,
  isAvailable,
  isUntestedRow,
} from '../../src/core/capability-table.mjs'

test('环境键是有限清单：恰为 7 × 6 = 42 格，且不含 engine / versionBand', () => {
  const expected = []
  for (const c of CONTAINERS) for (const o of OSES) expected.push(`${c}:${o}`)
  assert.equal(CONTAINERS.length, 7)
  assert.equal(OSES.length, 6)
  assert.equal(expected.length, 42)
  assert.deepEqual(Object.keys(CAPABILITY_TABLE).sort(), [...expected].sort())
  assert.deepEqual([...ENV_KEYS].sort(), [...expected].sort())
  for (const key of ENV_KEYS) {
    assert.equal(key.includes('engine'), false)
    assert.equal(key.includes('versionBand'), false)
    // 每格都必须对六项动作给值（缺依据也要成格）
    assert.equal(Object.keys(CAPABILITY_TABLE[key]).length, ACTION_IDS.length)
  }
})

test('能力表每格证据等级与置信度取值合法，available 只在三态内', () => {
  for (const key of ENV_KEYS) {
    for (const actionId of ACTION_IDS) {
      const cell = CAPABILITY_TABLE[key][actionId]
      assert.ok(EVIDENCE_LEVELS.includes(cell.evidence), `${key}/${actionId} 证据等级越界：${cell.evidence}`)
      assert.ok(CONFIDENCE_LEVELS.includes(cell.confidence), `${key}/${actionId} 置信度越界：${cell.confidence}`)
      assert.ok([true, false, null].includes(cell.available), `${key}/${actionId} available 只能是 true/false/null`)
    }
  }
})

test('仅文档证据：available 为 true 时置信度必须是 low', () => {
  let checked = 0
  for (const key of ENV_KEYS) {
    for (const actionId of ACTION_IDS) {
      const cell = CAPABILITY_TABLE[key][actionId]
      if (cell.evidence === '仅文档' && cell.available === true) {
        assert.equal(cell.confidence, 'low', `${key}/${actionId} 文档级证据不得给高置信`)
        checked += 1
      }
    }
  }
  assert.ok(checked > 0, '至少要有若干文档级可用格，否则能力表退化成空表')
})

test('未实测格：available 为 null（不是 false 也不是 true）、置信度 unknown', () => {
  let checked = 0
  for (const key of ENV_KEYS) {
    for (const actionId of ACTION_IDS) {
      const cell = CAPABILITY_TABLE[key][actionId]
      if (cell.evidence !== '未实测') continue
      assert.equal(cell.available, null, `${key}/${actionId} 未实测格不得填推测值`)
      assert.equal(cell.confidence, 'unknown')
      checked += 1
    }
  }
  assert.ok(checked > 0, '本轮全部为文档级与未实测两级证据，未实测格不应为 0')
})

test('未知环境整行未实测，且落中性兜底不输出强动作', () => {
  const row = capabilityRowFor({ container: 'unknown', os: 'unknown' })
  assert.equal(isUntestedRow(row), true)
  assert.equal(ACTION_IDS.some((a) => isAvailable(row[a])), false)
  assert.equal(capabilityRowFor(UNKNOWN_ENV_KEY), row)
})

test('envKeyFor：维度缺失或越界一律落 unknown 档，绝不用默认值冒充已知', () => {
  assert.equal(envKeyFor({ container: 'wechat', os: 'ios' }), 'wechat:ios')
  assert.equal(envKeyFor({ container: 'wechat' }), 'wechat:unknown')
  assert.equal(envKeyFor({}), 'unknown:unknown')
  assert.equal(envKeyFor(null), 'unknown:unknown')
  assert.equal(envKeyFor({ container: 'safari', os: 'ios' }), 'unknown:ios')
  assert.equal(envKeyFor({ container: 'browser', os: 'watchos' }), 'browser:unknown')
})

test('isAvailable 只认 true；false 与 null 都不算可用', () => {
  assert.equal(isAvailable({ available: true }), true)
  assert.equal(isAvailable({ available: false }), false)
  assert.equal(isAvailable({ available: null }), false)
  assert.equal(isAvailable(undefined), false)
  assert.equal(isAvailable(null), false)
})

test('文档级证据格确实带内容（抽查微信内与 iOS 浏览器）', () => {
  const wechatIos = capabilityRowFor(envKey('wechat', 'ios'))
  assert.equal(wechatIos['preview.longpress'].evidence, '仅文档')
  assert.equal(isAvailable(wechatIos['preview.longpress']), true)
  assert.equal(isAvailable(wechatIos['save.album']), false)
  assert.equal(isAvailable(wechatIos['copy.link']), true)

  const browserIos = capabilityRowFor('browser:ios')
  assert.equal(isAvailable(browserIos['share.system']), true)
  assert.equal(isAvailable(browserIos['save.album']), false)

  const pcWechat = capabilityRowFor('wechat-desktop:macos')
  assert.equal(isAvailable(pcWechat['preview.longpress']), false, 'PC 微信不得给出长按引导（AE2）')
})
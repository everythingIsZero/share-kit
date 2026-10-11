/**
 * tests/capability-table.test.mjs — 环境能力表边界（node:test，零依赖）
 * 覆盖 Unit 1 第 5、6、7 条：环境键是有限清单 / 证据来源键可溯源 / 有来源与未实测的取值规则
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
  SOURCES,
  UNKNOWN_ENV_KEY,
  UNMEASURED,
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
    // 每格都必须对七项动作给值（缺依据也要成格）
    assert.equal(Object.keys(CAPABILITY_TABLE[key]).length, ACTION_IDS.length)
  }
})

test('能力表每格证据值与置信度合法，available 只在三态内', () => {
  for (const key of ENV_KEYS) {
    for (const actionId of ACTION_IDS) {
      const cell = CAPABILITY_TABLE[key][actionId]
      assert.ok(EVIDENCE_LEVELS.includes(cell.evidence), `${key}/${actionId} 证据值越界：${cell.evidence}`)
      assert.ok(CONFIDENCE_LEVELS.includes(cell.confidence), `${key}/${actionId} 置信度越界：${cell.confidence}`)
      assert.ok([true, false, null].includes(cell.available), `${key}/${actionId} available 只能是 true/false/null`)
    }
  }
})

test('可溯源证据：非未实测格的 evidence 必须命中 SOURCES；available 为 true 时置信度 low', () => {
  const sourceKeys = new Set(Object.keys(SOURCES))
  let sourced = 0
  for (const key of ENV_KEYS) {
    for (const actionId of ACTION_IDS) {
      const cell = CAPABILITY_TABLE[key][actionId]
      if (cell.evidence === UNMEASURED) continue
      assert.ok(sourceKeys.has(cell.evidence), `${key}/${actionId} 来源键不在 SOURCES：${cell.evidence}`)
      if (cell.available === true) {
        assert.equal(cell.confidence, 'low', `${key}/${actionId} 有来源但可用仍不得给高置信`)
      }
      sourced += 1
    }
  }
  assert.ok(sourced > 0, '至少要有若干有来源的格子，否则能力表退化成空表')
})

test('SOURCES 覆盖上表权威来源：caniuse / MDN / WebView-CG / 微信官方 / 真机实测', () => {
  for (const key of ['caniuse', 'mdn', 'webviewCg', 'wechatJssdk', 'jinlab']) {
    assert.equal(typeof SOURCES[key], 'string', `缺少来源 ${key}`)
    assert.ok(SOURCES[key].length > 0)
  }
  assert.equal(EVIDENCE_LEVELS.includes(UNMEASURED), true)
  assert.deepEqual(EVIDENCE_LEVELS, [...Object.keys(SOURCES), UNMEASURED])
})

test('未实测格：available 为 null（不是 false 也不是 true）、置信度 unknown', () => {
  let checked = 0
  for (const key of ENV_KEYS) {
    for (const actionId of ACTION_IDS) {
      const cell = CAPABILITY_TABLE[key][actionId]
      if (cell.evidence !== UNMEASURED) continue
      assert.equal(cell.available, null, `${key}/${actionId} 未实测格不得填推测值`)
      assert.equal(cell.confidence, 'unknown')
      checked += 1
    }
  }
  assert.ok(checked > 0, '未实测格不应为 0')
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

test('有来源格确实带内容（抽查微信内与 iOS 浏览器）', () => {
  const wechatIos = capabilityRowFor(envKey('wechat', 'ios'))
  assert.equal(wechatIos['preview.longpress'].evidence, 'jinlab')
  assert.equal(isAvailable(wechatIos['preview.longpress']), true)
  assert.equal(isAvailable(wechatIos['save.album']), false)
  assert.equal(isAvailable(wechatIos['save.download']), false)
  assert.equal(isAvailable(wechatIos['copy.link']), true)

  const browserIos = capabilityRowFor('browser:ios')
  assert.equal(isAvailable(browserIos['share.system']), true)
  // save.album（系统面板 → 相册/文件）在 iOS 可用；save.download（a[download]）iOS13+ 亦可用
  assert.equal(isAvailable(browserIos['save.album']), true)
  assert.equal(isAvailable(browserIos['save.download']), true)
  assert.equal(browserIos['save.album'].evidence, 'mdn')

  const pcWechat = capabilityRowFor('wechat-desktop:macos')
  assert.equal(isAvailable(pcWechat['preview.longpress']), false, 'PC 微信不得给出长按引导（AE2）')
})

test('item 2：微信 Android 长按保存失败 → preview.longpress 为 false（不再误标 true）', () => {
  const row = capabilityRowFor('wechat:android')
  assert.equal(row['preview.longpress'].available, false, 'Android（XWeb）长按保存失败（jinlab 实测）')
  assert.equal(row['preview.longpress'].evidence, 'jinlab')
  // iOS 仍可长按保存，两者必须分开
  assert.equal(capabilityRowFor('wechat:ios')['preview.longpress'].available, true)
  // 微信内 share.system 保持 false（iOS 未证实、Android WebView 不暴露）
  assert.equal(capabilityRowFor('wechat:ios')['share.system'].available, false)
  assert.equal(row['share.system'].available, false)
})

test('item 2：鸿蒙（ArkWeb）新增行——无系统分享，a[download] 落下载目录', () => {
  for (const key of ['browser:harmony', 'pwa-standalone:harmony']) {
    const row = capabilityRowFor(key)
    assert.equal(row['share.system'].available, false, `${key} 不支持 navigator.share（WebView-CG BCD）`)
    assert.equal(row['save.album'].available, false, `${key} 不支持 canShare({files})，无系统面板保存`)
    assert.equal(row['save.download'].available, true, `${key} a[download] 支持 → 下载目录`)
    assert.equal(row['copy.link'].available, true)
    assert.equal(row['preview.longpress'].available, null, `${key} 长按行为未实测（不填推测值）`)
    assert.equal(row['preview.longpress'].evidence, '未实测')
    assert.equal(row['save.download'].evidence, 'webviewCg')
  }
})

test('item 2：Android Chrome save.album / save.download 明确可用（系统面板 + 下载目录）', () => {
  const row = capabilityRowFor('browser:android')
  assert.equal(row['save.album'].available, true, 'Android Chrome 原生 canShare({files}) → 系统面板')
  assert.equal(row['save.download'].available, true, 'a[download] → 下载目录')
  assert.equal(row['share.system'].available, true)
})

test('保存语义拆分：save.album 与 save.download 可用性相互独立（不是同一格）', () => {
  // 有判定力：全表必须存在二者可用性不同的环境——若把 download 绑死成 album 的同值，本断言失败
  const separable = ENV_KEYS.filter((key) => {
    const row = CAPABILITY_TABLE[key]
    return row['save.album'].available !== row['save.download'].available
  })
  assert.ok(separable.length > 0, '必须存在 save.album 与 save.download 可用性不同的环境（否则拆分无意义）')
  // 桌面浏览器：无系统面板保存（canShare files 不支持），但下载可用——两者必须分开
  for (const key of ['browser:macos', 'browser:windows']) {
    assert.equal(capabilityRowFor(key)['save.album'].available, false, `${key} 桌面不支持文件系统面板`)
    assert.equal(capabilityRowFor(key)['save.download'].available, true, `${key} 下载可用`)
  }
})
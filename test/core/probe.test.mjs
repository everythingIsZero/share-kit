/**
 * tests/probe.test.mjs — 环境指纹归一（node:test，零依赖）
 * 覆盖 Unit 2 的 12 条：容器 / 系统 / 内核 / 版本带四维，含未知档与纯函数性
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { ENGINE_VALUES, normalizeFingerprint, detectVersionBand } from '../../src/core/probe.mjs'

/** 造一份原始信号（只给用得到的字段，其余缺失照真实情况） */
function sig(ua, extra = {}) {
  return { ua, ...extra }
}

test('微信 iOS：container=wechat / os=ios / engine=wkwebview', () => {
  const ua =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.50(0x1800323c) NetType/WIFI Language/zh_CN'
  const { fingerprint } = normalizeFingerprint(sig(ua))
  assert.equal(fingerprint.container, 'wechat')
  assert.equal(fingerprint.os, 'ios')
  assert.equal(fingerprint.engine, 'wkwebview')
  assert.equal(fingerprint.versionBand, 'ios-17')
  assert.deepEqual(fingerprint.unknown, [])
})

test('微信安卓：container=wechat / os=android / engine=blink', () => {
  const ua =
    'Mozilla/5.0 (Linux; Android 14; V2312A Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36 MicroMessenger/8.0.49(0x28003133)'
  const { fingerprint } = normalizeFingerprint(sig(ua, { maxTouchPoints: 5 }))
  assert.equal(fingerprint.container, 'wechat')
  assert.equal(fingerprint.os, 'android')
  assert.equal(fingerprint.engine, 'blink')
})

test('iPadOS 联合判定：缺触点数落 unknown，有触点数才判 ios', () => {
  const ua =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  const missing = normalizeFingerprint(sig(ua)).fingerprint
  assert.equal(missing.os, 'unknown')
  assert.ok(missing.unknown.includes('os'))

  const withTouch = normalizeFingerprint(sig(ua, { maxTouchPoints: 5 })).fingerprint
  assert.equal(withTouch.os, 'ios')
  assert.equal(withTouch.container, 'browser')
  assert.equal(withTouch.engine, 'wkwebview')
})

test('微信桌面版与移动端分开：无移动端标志即 wechat-desktop（AE2 的前置判定）', () => {
  const desktop =
    'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 MicroMessenger/3.9.0.48(0x13090030)'
  assert.equal(normalizeFingerprint(sig(desktop)).fingerprint.container, 'wechat-desktop')

  const macDesktop =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 MicroMessenger/3.8.9'
  const macFp = normalizeFingerprint(sig(macDesktop, { maxTouchPoints: 0 })).fingerprint
  assert.equal(macFp.container, 'wechat-desktop')
  assert.equal(macFp.os, 'macos')
})

test('Chrome 版本被冻结（机型统一为 K）不影响系统与内核判定', () => {
  const ua =
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
  const { fingerprint } = normalizeFingerprint(sig(ua, { maxTouchPoints: 5 }))
  assert.equal(fingerprint.os, 'android')
  assert.equal(fingerprint.engine, 'blink')
})

test('小程序 web-view 容器：miniProgram 标记先于 MicroMessenger 命中', () => {
  const ua =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.50 miniProgram/1.0.0'
  assert.equal(normalizeFingerprint(sig(ua)).fingerprint.container, 'wechat-miniprogram-webview')
})

test('抖音容器：aweme / ByteLocale 命中 douyin', () => {
  const ua =
    'Mozilla/5.0 (Linux; Android 13; Pixel 5 Build/TQ3A) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/110.0.0.0 Mobile Safari/537.36 aweme_6.6.0 ByteLocale/zh_CN'
  assert.equal(normalizeFingerprint(sig(ua, { maxTouchPoints: 5 })).fingerprint.container, 'douyin')
})

test('鸿蒙系统先于 Android 命中：HarmonyOS / OpenHarmony → harmony', () => {
  const ua =
    'Mozilla/5.0 (Linux; Android 12; HarmonyOS; ALN-AL00) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36'
  assert.equal(normalizeFingerprint(sig(ua, { maxTouchPoints: 5 })).fingerprint.os, 'harmony')

  const openHarmony =
    'Mozilla/5.0 (Phone; OpenHarmony 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36'
  assert.equal(normalizeFingerprint(sig(openHarmony, { maxTouchPoints: 5 })).fingerprint.os, 'harmony')
})

test('国产内核先于 Blink：UCBrowser / Quark → u4', () => {
  const uc =
    'Mozilla/5.0 (Linux; U; Android 13; zh-CN; V2312A Build/TKQ1) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/100.0.0.0 UCBrowser/15.0.0.0 Mobile Safari/537.36'
  assert.equal(normalizeFingerprint(sig(uc, { maxTouchPoints: 5 })).fingerprint.engine, 'u4')

  const quark =
    'Mozilla/5.0 (Linux; Android 13; V2312A) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/100.0.0.0 Quark/6.0 Mobile Safari/537.36'
  assert.equal(normalizeFingerprint(sig(quark, { maxTouchPoints: 5 })).fingerprint.engine, 'u4')
})

test('版本带只作修饰：版本数字变，其余三维不变', () => {
  const ua16 =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Mobile/15E148 Safari/604.1'
  const ua17 =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
  const a = normalizeFingerprint(sig(ua16)).fingerprint
  const b = normalizeFingerprint(sig(ua17)).fingerprint
  assert.equal(a.versionBand, 'ios-16')
  assert.equal(b.versionBand, 'ios-17')
  assert.notEqual(a.versionBand, b.versionBand)
  assert.deepEqual([a.container, a.os, a.engine], [b.container, b.os, b.engine])
})

test('空信号全部落未知：四维 unknown，unknown 数组长度等于参与判定的维度数', () => {
  const { fingerprint, signals } = normalizeFingerprint({})
  assert.equal(fingerprint.container, 'unknown')
  assert.equal(fingerprint.os, 'unknown')
  assert.equal(fingerprint.engine, 'unknown')
  assert.equal(fingerprint.versionBand, 'unknown')
  assert.equal(fingerprint.unknown.length, 4)
  assert.deepEqual([...fingerprint.unknown], ['container', 'os', 'engine', 'versionBand'])
  assert.deepEqual(signals, {})

  // 非法入参同样走兜底，不抛错
  const none = normalizeFingerprint(null).fingerprint
  assert.equal(none.container, 'unknown')
  assert.equal(none.unknown.length, 4)
})

test('纯函数性：同输入两次输出相等，且入参对象未被改动', () => {
  const signals = {
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.50',
    maxTouchPoints: 5,
    isSecureContext: true,
    canShareFiles: true,
    hasStandaloneDisplayMode: false,
    hasDownloadAttr: true,
    hasTransientActivation: true,
  }
  const snapshot = JSON.parse(JSON.stringify(signals))
  const first = normalizeFingerprint(signals)
  const second = normalizeFingerprint(signals)
  assert.equal(JSON.stringify(first), JSON.stringify(second))
  assert.deepEqual(signals, snapshot, '入参必须原样不动')
  assert.notEqual(first.signals, signals, 'signals 回显应是副本')
})

test('枚举取值与能力表口径一致（未知档必须在枚举内）', () => {
  assert.ok(ENGINE_VALUES.includes('unknown'))
  assert.equal(detectVersionBand('', 'ios'), 'unknown')
  assert.equal(detectVersionBand('Mozilla/5.0 iPhone', 'ios'), 'unknown')
  assert.equal(detectVersionBand('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)', 'ios'), 'ios-17')
  assert.equal(detectVersionBand('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'windows'), 'windows-10')
})
/**
 * probe.mjs — 环境指纹归一（R1、R3）
 *
 * 边界（R3，重要）：**原始信号由适配包采集**（`share-kit/web` 读 window/navigator），
 * 本文件只对纯数据信号做纯字符串与布尔归一（含对 UA 字符串的纯字符串解析），
 * 不 import 任何宿主 API，也不读全局对象——因此在 node:test 里可以被完整覆盖。
 *
 * 判不准的维度一律落 `unknown` 并记进 `fingerprint.unknown` 数组，绝不用默认值冒充已知（R1）。
 * iPadOS 必须「UA + maxTouchPoints 联合判」：它把自己伪装成 macOS，只看 UA 会把 iPad 判成 Mac。
 */

/** 宿主容器枚举（含未知档） */
export const CONTAINER_VALUES = Object.freeze([
  'wechat',
  'wechat-desktop',
  'wechat-miniprogram-webview',
  'douyin',
  'browser',
  'pwa-standalone',
  'unknown',
])

/** 操作系统枚举（含未知档） */
export const OS_VALUES = Object.freeze(['ios', 'android', 'macos', 'windows', 'harmony', 'unknown'])

/** 浏览器内核枚举（含未知档） */
export const ENGINE_VALUES = Object.freeze(['wkwebview', 'blink', 'gecko', 'u4', 'unknown'])

/** 参与指纹判定的维度（顺序即 unknown 数组顺序） */
export const FINGERPRINT_DIMENSIONS = Object.freeze(['container', 'os', 'engine', 'versionBand'])

/** 版本带判定规则（只作修饰字段，不作分支条件；Chrome 版本归零/机型统一为 K 都不影响判定） */
export const VERSION_BAND_PATTERNS = Object.freeze({
  ios: /OS (\d+)[_.]/,
  android: /Android (\d+)/i,
  macos: /Mac OS X (\d+)[_.]/,
  windows: /Windows NT (\d+)\./,
  harmony: /(?:HarmonyOS|OpenHarmony)[ /]?(\d+)/i,
})

const RE_BROWSER_ISH = /Mozilla|Opera|Chrome|Safari|Firefox|Edg|Version\//i
const RE_MINIPROGRAM = /miniprogram/i
const RE_DOUYIN = /aweme|ByteLocale/i
const RE_HARMONY = /HarmonyOS|OpenHarmony/i
const RE_ANDROID = /Android/i
const RE_APPLE_MOBILE = /iPhone|iPad|iPod/i
const RE_MAC = /Macintosh|Mac OS X/i
const RE_WINDOWS = /Windows NT|Windows/i
const RE_U4 = /UCBrowser|UCWEB|Quark|UBrowser|UWS/i
const RE_GECKO = /Firefox\/|FxiOS/i
const RE_BLINK = /Chrome\/|Chromium\/|CriOS|Edg\/|EdgA|EdgiOS|OPR\//i
const RE_WEBKIT = /AppleWebKit/i
const RE_SAFARI = /Safari\//i
// 移动端 UA 标志：现代手机浏览器 UA 被冻结后多数仍保留 `Mobile/`（iOS 与安卓均为 `Mobile/xxxxx`）
const RE_MOBILE_UA = /Mobile\/[A-Za-z0-9]/i

/** 宿主容器判定（判定顺序即优先级：容器关键字先于「长得像浏览器」） */
export function detectContainer(ua, signals = {}) {
  if (typeof ua !== 'string' || ua.length === 0) return 'unknown'
  if (RE_MINIPROGRAM.test(ua)) return 'wechat-miniprogram-webview'
  if (/MicroMessenger/i.test(ua)) {
    // 桌面微信与移动微信必须分开：PC 微信没有长按、没有相册，给长按引导是错的（AE2）
    return RE_MOBILE_UA.test(ua) || RE_ANDROID.test(ua) || RE_APPLE_MOBILE.test(ua) ? 'wechat' : 'wechat-desktop'
  }
  if (RE_DOUYIN.test(ua)) return 'douyin'
  if (signals.hasStandaloneDisplayMode === true) return 'pwa-standalone'
  if (RE_BROWSER_ISH.test(ua)) return 'browser'
  return 'unknown'
}

/**
 * 系统判定。
 * 鸿蒙先于 Android（鸿蒙 UA 常带 Android 兼容串）；iPadOS 落在伪装成 macOS 的分支里，
 * 必须拿到 maxTouchPoints > 1 才敢判 ios，否则落 unknown。
 */
export function detectOs(ua, maxTouchPoints) {
  if (typeof ua !== 'string' || ua.length === 0) return 'unknown'
  if (RE_HARMONY.test(ua)) return 'harmony'
  if (RE_ANDROID.test(ua)) return 'android'
  if (RE_APPLE_MOBILE.test(ua)) return 'ios'
  if (RE_MAC.test(ua)) {
    if (typeof maxTouchPoints === 'number' && maxTouchPoints > 1) return 'ios'
    if (maxTouchPoints === 0 || maxTouchPoints === 1) return 'macos'
    return 'unknown'
  }
  if (RE_WINDOWS.test(ua)) return 'windows'
  return 'unknown'
}

/** 内核判定（iOS 全系都是 WKWebView；国产内核先于 Blink） */
export function detectEngine(ua, os) {
  if (typeof ua !== 'string' || ua.length === 0) return 'unknown'
  if (RE_U4.test(ua)) return 'u4'
  if (os === 'ios') return 'wkwebview'
  if (RE_GECKO.test(ua)) return 'gecko'
  if (RE_BLINK.test(ua)) return 'blink'
  if (RE_WEBKIT.test(ua) && RE_SAFARI.test(ua)) return 'wkwebview'
  return 'unknown'
}

/** 版本带：`<os>-<主版本号>`；判不出落 unknown。只作修饰，不参与动作决策 */
export function detectVersionBand(ua, os) {
  if (typeof ua !== 'string' || ua.length === 0) return 'unknown'
  const pattern = Object.prototype.hasOwnProperty.call(VERSION_BAND_PATTERNS, os)
    ? VERSION_BAND_PATTERNS[os]
    : null
  if (!pattern) return 'unknown'
  const m = pattern.exec(ua)
  return m ? `${os}-${m[1]}` : 'unknown'
}

/**
 * 归一入口：`signals` 为纯数据对象，所有字段可缺。
 * 输出两块：`fingerprint`（脱敏四维，进事件）与 `signals`（原始信号回显，仅供 core 运行时用，不进事件）。
 * 纯函数：不改入参、无副作用、同输入同输出。
 */
export function normalizeFingerprint(signals) {
  const src = signals && typeof signals === 'object' ? signals : {}
  const ua = typeof src.ua === 'string' ? src.ua : ''

  const container = detectContainer(ua, src)
  const os = detectOs(ua, src.maxTouchPoints)
  const engine = detectEngine(ua, os)
  const versionBand = detectVersionBand(ua, os)

  const dims = { container, os, engine, versionBand }
  const unknown = FINGERPRINT_DIMENSIONS.filter((dim) => dims[dim] === 'unknown')

  return {
    fingerprint: { ...dims, unknown },
    signals: { ...src },
  }
}
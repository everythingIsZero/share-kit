/**
 * capability-table.mjs — 环境能力表（单源数据，R16）
 *
 * 组织方式：环境键 = `${container}:${os}`，`container` 7 值 × `os` 6 值 = 42 格；
 * 每格对七个动作各给一条 `{ available, confidence, evidence }`。
 * `engine` 与 `versionBand` 只作修饰字段、不进环境键——内核不同不会让动作可用性翻转，
 * 版本带只影响提示文案的覆盖与置信度，不影响「能不能用」。
 *
 * 证据语义（2026-10-11 权威化）：`evidence` **记来源键**（`SOURCES` 的键），
 * 不再写「仅文档」这类模糊等级——每一格的可用性都必须能指回一条可核对的来源。
 *   · 有来源的格子 → `evidence: <来源键>`；`available: true` 时 confidence 一律 `'low'`
 *     （第三方来源不构成本仓的高置信，但**来源可追溯**）；
 *   · 无来源的格子 → `evidence: '未实测'`，`available` 为 `null`（不填推测值），confidence `'unknown'`。
 * 真机（iPhone / macOS）与模拟器实测由出资人补测后回填：只改来源键与 confidence，
 * 不改表结构（README 的端支持表逐格登记）。
 *
 * 保存语义（2026-10-11 拆分）：`save.album` = **系统面板保存**（`navigator.share({files})`
 * → 相册 / 文件），`save.download` = **`a[download]` 直接下载**（→ 下载目录）。
 * 两者是不同机制、不同落点，文案必须分别如实（不得承诺相册而落下载）。
 *
 * 本文件零宿主依赖（R3）。
 */

import { ACTION_IDS } from './actions.mjs'

/**
 * 证据来源（单源：每格 `evidence` 指向其中一个键，或 `'未实测'`）。
 * 权威来源：caniuse / MDN / W3C WebView CG / 微信官方 JS-SDK 文档 / 真机实测记录。
 */
export const SOURCES = Object.freeze({
  caniuse: 'caniuse.com：Web Share API（navigator.share / canShare）与 a[download] 浏览器支持矩阵',
  mdn: 'MDN Web Docs：Navigator.share / Navigator.canShare / a[download] 行为与版本下限',
  webviewCg: 'W3C WebView Community Group browser-compat-data：ArkWeb（鸿蒙）等 WebView 能力实测',
  wechatJssdk: '微信官方 JS-SDK 文档：自定义分享卡片（updateAppMessageShareData 等）',
  jinlab: 'jinlab 真机实测：微信 iOS / Android 分享与长按保存行为',
  caniwebview: 'caniwebview.com：Android WebView 不暴露 Web Share API（须降级）',
  chromium: 'Chromium bug 765923：Android WebView 不暴露 navigator.share',
  unconditional: '设计不变量：复制链接不依赖任何宿主能力，任何环境都能兜底（R10）',
})

/** 未实测格子的证据值（不是来源键） */
export const UNMEASURED = '未实测'

/** 合法证据值：来源键全集 ∪ {未实测}（R16） */
export const EVIDENCE_LEVELS = Object.freeze([...Object.keys(SOURCES), UNMEASURED])

/** 置信度档位（未实测一律 unknown，未知不得冒充已知，引 R1） */
export const CONFIDENCE_LEVELS = Object.freeze(['high', 'medium', 'low', 'unknown'])

/** 宿主容器维度（7 值，含「未知」档） */
export const CONTAINERS = Object.freeze([
  'wechat',
  'wechat-desktop',
  'wechat-miniprogram-webview',
  'douyin',
  'browser',
  'pwa-standalone',
  'unknown',
])

/** 操作系统维度（6 值，含「未知」档） */
export const OSES = Object.freeze(['ios', 'android', 'macos', 'windows', 'harmony', 'unknown'])

/** 环境键：`<container>:<os>` */
export function envKey(container, os) {
  return `${container}:${os}`
}

/** 默认走中性兜底的环境键（container 与 os 都判不出来时用） */
export const UNKNOWN_ENV_KEY = envKey('unknown', 'unknown')

/** 42 格环境键全集 */
export const ENV_KEYS = Object.freeze(CONTAINERS.flatMap((c) => OSES.map((o) => envKey(c, o))))

/** 一条有来源的格子取值 */
function cell(available, source) {
  return Object.freeze({ available, source })
}

/**
 * 有来源的格子：动作 → `{ available, source }`；整条动作缺失 = 未实测。
 *
 * 微信内置浏览器（wechat）：App 层屏蔽资源下载（非 API 缺失），图片唯一可靠路径是长按；
 *   视频没有前端保存路径；JS-SDK 只能预设卡片、点击仍由用户手动。
 *   iOS 长按可保存图片（jinlab 实测）；Android（XWeb）长按保存**失败**（jinlab 实测），
 *   Android WebView 亦不暴露 navigator.share（caniwebview / chromium 765923）。
 * PC 微信（wechat-desktop）：无长按、无系统分享面板；卡片可用；长按类动作一律不可用（AE2）。
 *   `save.album` / `save.download` 均无可靠文档 → 留未实测，是否真能存下来由运行时信号兜底
 *   （`decide.mjs` 的信号兜底：探得到 a[download] 才走下载，探不到仍退回复制链接）。
 * 小程序 web-view（wechat-miniprogram-webview）：H5 既不能写相册、也不能直接调起原生分享
 *   （需宿主页），且宿主屏蔽下载；仅复制链接可用；长按行为无可靠文档 → 留未实测。
 * 微信外浏览器（browser）：iOS 全系 WKWebView，系统面板 `share({files})` 可存相册/文件，
 *   `a[download]` iOS13+ 落「文件」；Android Chrome 两者原生可用；桌面浏览器 `a[download]`
 *   可用（落下载目录），但桌面不支持 `canShare({files})` → 无系统面板保存；
 *   鸿蒙 ArkWeb 不支持 `navigator.share/canShare`（WebView-CG BCD 实测 false），`a[download]` 支持。
 * 桌面应用（pwa-standalone）：iOS 装到桌面仍是 WKWebView，能力与 Safari 一致；鸿蒙同浏览器。
 */
const DOCUMENTED = Object.freeze({
  'wechat:ios': Object.freeze({
    'save.album': cell(false, 'jinlab'),
    'save.download': cell(false, 'jinlab'),
    'share.system': cell(false, 'jinlab'),
    'share.card.wx': cell(true, 'wechatJssdk'),
    'share.card.miniapp': cell(false, 'wechatJssdk'),
    'copy.link': cell(true, 'unconditional'),
    'preview.longpress': cell(true, 'jinlab'),
  }),
  // Android（XWeb）：长按保存失败（jinlab 实测，2026-10-11 修正，此前误标 true）。
  'wechat:android': Object.freeze({
    'save.album': cell(false, 'jinlab'),
    'save.download': cell(false, 'jinlab'),
    'share.system': cell(false, 'caniwebview'),
    'share.card.wx': cell(true, 'wechatJssdk'),
    'share.card.miniapp': cell(false, 'wechatJssdk'),
    'copy.link': cell(true, 'unconditional'),
    'preview.longpress': cell(false, 'jinlab'),
  }),
  'wechat-desktop:macos': Object.freeze({
    'share.system': cell(false, 'jinlab'),
    'share.card.wx': cell(true, 'wechatJssdk'),
    'share.card.miniapp': cell(false, 'wechatJssdk'),
    'copy.link': cell(true, 'unconditional'),
    'preview.longpress': cell(false, 'jinlab'),
  }),
  'wechat-desktop:windows': Object.freeze({
    'share.system': cell(false, 'jinlab'),
    'share.card.wx': cell(true, 'wechatJssdk'),
    'share.card.miniapp': cell(false, 'wechatJssdk'),
    'copy.link': cell(true, 'unconditional'),
    'preview.longpress': cell(false, 'jinlab'),
  }),
  'wechat-miniprogram-webview:ios': Object.freeze({
    'save.album': cell(false, 'jinlab'),
    'save.download': cell(false, 'jinlab'),
    'share.system': cell(false, 'caniwebview'),
    'share.card.wx': cell(false, 'wechatJssdk'),
    'share.card.miniapp': cell(false, 'wechatJssdk'),
    'copy.link': cell(true, 'unconditional'),
  }),
  'wechat-miniprogram-webview:android': Object.freeze({
    'save.album': cell(false, 'jinlab'),
    'save.download': cell(false, 'jinlab'),
    'share.system': cell(false, 'caniwebview'),
    'share.card.wx': cell(false, 'wechatJssdk'),
    'share.card.miniapp': cell(false, 'wechatJssdk'),
    'copy.link': cell(true, 'unconditional'),
  }),
  'browser:ios': Object.freeze({
    // 系统面板（share({files}) → 相册/文件）可用；a[download] iOS13+ 落「文件」。
    'save.album': cell(true, 'mdn'),
    'save.download': cell(true, 'mdn'),
    'share.system': cell(true, 'caniuse'),
    'share.card.wx': cell(false, 'wechatJssdk'),
    'share.card.miniapp': cell(false, 'wechatJssdk'),
    'copy.link': cell(true, 'unconditional'),
    'preview.longpress': cell(true, 'mdn'),
  }),
  // Android Chrome：navigator.share/canShare 原生；系统面板保存与下载目录均可用。
  'browser:android': Object.freeze({
    'save.album': cell(true, 'mdn'),
    'save.download': cell(true, 'mdn'),
    'share.system': cell(true, 'caniuse'),
    'share.card.wx': cell(false, 'wechatJssdk'),
    'share.card.miniapp': cell(false, 'wechatJssdk'),
    'copy.link': cell(true, 'unconditional'),
    'preview.longpress': cell(true, 'mdn'),
  }),
  // 桌面浏览器：a[download] 落下载目录；不支持 canShare({files}) → 无系统面板保存。
  'browser:macos': Object.freeze({
    'save.album': cell(false, 'caniuse'),
    'save.download': cell(true, 'mdn'),
    'share.system': cell(true, 'caniuse'),
    'share.card.wx': cell(false, 'wechatJssdk'),
    'share.card.miniapp': cell(false, 'wechatJssdk'),
    'copy.link': cell(true, 'unconditional'),
    'preview.longpress': cell(false, 'mdn'),
  }),
  'browser:windows': Object.freeze({
    'save.album': cell(false, 'caniuse'),
    'save.download': cell(true, 'mdn'),
    'share.system': cell(true, 'caniuse'),
    'share.card.wx': cell(false, 'wechatJssdk'),
    'share.card.miniapp': cell(false, 'wechatJssdk'),
    'copy.link': cell(true, 'unconditional'),
    'preview.longpress': cell(false, 'mdn'),
  }),
  // 鸿蒙 ArkWeb：不支持 navigator.share/canShare（WebView-CG BCD 实测 false），a[download] 支持。
  'browser:harmony': Object.freeze({
    'save.album': cell(false, 'webviewCg'),
    'save.download': cell(true, 'webviewCg'),
    'share.system': cell(false, 'webviewCg'),
    'share.card.wx': cell(false, 'wechatJssdk'),
    'share.card.miniapp': cell(false, 'wechatJssdk'),
    'copy.link': cell(true, 'unconditional'),
    // preview.longpress 无可靠文档 → 留未实测（null）
  }),
  'pwa-standalone:ios': Object.freeze({
    'save.album': cell(true, 'mdn'),
    'save.download': cell(true, 'mdn'),
    'share.system': cell(true, 'caniuse'),
    'share.card.wx': cell(false, 'wechatJssdk'),
    'share.card.miniapp': cell(false, 'wechatJssdk'),
    'copy.link': cell(true, 'unconditional'),
    'preview.longpress': cell(true, 'mdn'),
  }),
  'pwa-standalone:android': Object.freeze({
    'save.album': cell(true, 'mdn'),
    'save.download': cell(true, 'mdn'),
    'share.system': cell(true, 'caniuse'),
    'share.card.wx': cell(false, 'wechatJssdk'),
    'share.card.miniapp': cell(false, 'wechatJssdk'),
    'copy.link': cell(true, 'unconditional'),
    'preview.longpress': cell(true, 'mdn'),
  }),
  // 鸿蒙桌面应用：同鸿蒙浏览器，无系统分享；a[download] 支持。
  'pwa-standalone:harmony': Object.freeze({
    'save.album': cell(false, 'webviewCg'),
    'save.download': cell(true, 'webviewCg'),
    'share.system': cell(false, 'webviewCg'),
    'share.card.wx': cell(false, 'wechatJssdk'),
    'share.card.miniapp': cell(false, 'wechatJssdk'),
    'copy.link': cell(true, 'unconditional'),
  }),
})

/** 未实测格子的取值：可用性未知（不是 false），证据与置信度如实标注 */
function untestedCell() {
  return Object.freeze({ available: null, confidence: 'unknown', evidence: UNMEASURED })
}

/** 有来源格子的取值：available true 时 confidence 一律 low（来源可追溯，但不构成本仓高置信） */
function documentedCell(spec) {
  return Object.freeze({ available: spec.available, confidence: 'low', evidence: spec.source })
}

function buildRow(key) {
  const row = DOCUMENTED[key]
  const cells = {}
  for (const actionId of ACTION_IDS) {
    cells[actionId] = row && Object.prototype.hasOwnProperty.call(row, actionId)
      ? documentedCell(row[actionId])
      : untestedCell()
  }
  return Object.freeze(cells)
}

/** 能力表：环境键 → 七项动作的取值（42 格全成格，缺来源的格子也成格并标未实测） */
export const CAPABILITY_TABLE = Object.freeze(
  Object.fromEntries(ENV_KEYS.map((key) => [key, buildRow(key)]))
)

/**
 * 由指纹取环境键：维度判不出或不在枚举内时落 `unknown` 档（绝不用默认值冒充已知，引 R1）。
 * `unknown:unknown` 行必然存在，因此调用方拿到的键一定能在表里查到。
 */
export function envKeyFor(fingerprint) {
  const fp = fingerprint && typeof fingerprint === 'object' ? fingerprint : {}
  const container = CONTAINERS.includes(fp.container) ? fp.container : 'unknown'
  const os = OSES.includes(fp.os) ? fp.os : 'unknown'
  return envKey(container, os)
}

/** 取一行能力表；传入指纹或环境键都行，查不到落 `unknown:unknown` 行 */
export function capabilityRowFor(fingerprintOrKey) {
  const key = typeof fingerprintOrKey === 'string' ? fingerprintOrKey : envKeyFor(fingerprintOrKey)
  return CAPABILITY_TABLE[key] || CAPABILITY_TABLE[UNKNOWN_ENV_KEY]
}

/** 该格是否「确定可用」：只有 available === true 才算（null / false 都不算） */
export function isAvailable(cell) {
  return Boolean(cell) && cell.available === true
}

/** 整行是否全为未实测（决定是否允许输出强引导，引 R16） */
export function isUntestedRow(row) {
  return ACTION_IDS.every((actionId) => row && row[actionId] && row[actionId].evidence === UNMEASURED)
}

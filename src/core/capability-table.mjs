/**
 * capability-table.mjs — 环境能力表（单源数据，R16）
 *
 * 组织方式：环境键 = `${container}:${os}`，`container` 7 值 × `os` 6 值 = 42 格；
 * 每格对六个动作各给一条 `{ available, confidence, evidence }`。
 * `engine` 与 `versionBand` 只作修饰字段、不进环境键——内核不同不会让动作可用性翻转，
 * 版本带只影响提示文案的覆盖与置信度，不影响「能不能用」。
 *
 * 取值来源：需求档 Sources & Research 的平台硬边界（2026-09-17 查证）与
 * `docs/knowledge/platforms-matrix.md`。本轮全部为文档级证据，因此：
 *   · 有依据的格子 → evidence `'仅文档'`；`available: true` 时 confidence 一律 `'low'`；
 *   · 无依据的格子 → evidence `'未实测'`，`available` 为 `null`（不填推测值），confidence `'unknown'`。
 * 真机（iPhone / macOS）与模拟器实测由出资人补测后回填：只改证据等级与 confidence，
 * 不改表结构（README 的端支持表逐格登记）。
 *
 * 本文件零宿主依赖（R3）。
 */

import { ACTION_IDS } from './actions.mjs'

/** 证据等级（四级，R16） */
export const EVIDENCE_LEVELS = Object.freeze(['真机实测', '模拟器或开发者工具', '仅文档', '未实测'])

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

/**
 * 文档级证据行：true = 该环境可用，false = 该环境确定不可用，整条动作缺失 = 未实测。
 *
 * 微信内置浏览器（wechat）：App 层屏蔽资源下载（非 API 缺失），图片唯一可靠路径是长按；
 *   视频没有前端保存路径；JS-SDK 只能预设卡片、点击仍由用户手动。
 * PC 微信（wechat-desktop）：无长按、无相册；卡片可用；长按类动作一律不可用（AE2）。
 *   `save.album` 在桌面的语义是「存到本机下载目录」，不是「进相册」——「无相册」这条理由
 *   属手机语义，张冠李戴，故不再填 false 冒充已知，留未实测；是否真能存下来由运行时信号
 *   兜底（`decide.mjs` 的信号兜底：探得到 a[download] 才走下载，探不到仍退回复制链接）。
 * 小程序 web-view（wechat-miniprogram-webview）：H5 既不能直接写相册，也不能直接调起
 *   原生分享（需宿主页），仅复制链接可用；长按行为无可靠文档 → 留未实测。
 * 微信外浏览器（browser）：iOS 全系 WKWebView，无写相册 API、a[download] 落「文件」不进
 *   相册，落相册唯一路径是系统面板或长按图片；桌面浏览器 a[download] 可用（save.album 在
 *   桌面语义为「存到本机下载目录」）。
 * 桌面应用（pwa-standalone）：iOS 装到桌面仍是 WKWebView，能力与 Safari 一致。
 */
const DOCUMENTED = Object.freeze({
  'wechat:ios': Object.freeze({
    'save.album': false,
    'share.system': false,
    'share.card.wx': true,
    'share.card.miniapp': false,
    'copy.link': true,
    'preview.longpress': true,
  }),
  'wechat:android': Object.freeze({
    'save.album': false,
    'share.system': false,
    'share.card.wx': true,
    'share.card.miniapp': false,
    'copy.link': true,
    'preview.longpress': true,
  }),
  'wechat-desktop:macos': Object.freeze({
    'share.system': false,
    'share.card.wx': true,
    'share.card.miniapp': false,
    'copy.link': true,
    'preview.longpress': false,
  }),
  'wechat-desktop:windows': Object.freeze({
    'share.system': false,
    'share.card.wx': true,
    'share.card.miniapp': false,
    'copy.link': true,
    'preview.longpress': false,
  }),
  'wechat-miniprogram-webview:ios': Object.freeze({
    'save.album': false,
    'share.system': false,
    'share.card.wx': false,
    'share.card.miniapp': false,
    'copy.link': true,
  }),
  'wechat-miniprogram-webview:android': Object.freeze({
    'save.album': false,
    'share.system': false,
    'share.card.wx': false,
    'share.card.miniapp': false,
    'copy.link': true,
  }),
  'browser:ios': Object.freeze({
    'save.album': false,
    'share.system': true,
    'share.card.wx': false,
    'share.card.miniapp': false,
    'copy.link': true,
    'preview.longpress': true,
  }),
  // Android 浏览器下载去向（下载目录是否进相册）文档不足 → save.album 留未实测
  'browser:android': Object.freeze({
    'share.system': true,
    'share.card.wx': false,
    'share.card.miniapp': false,
    'copy.link': true,
    'preview.longpress': true,
  }),
  'browser:macos': Object.freeze({
    'save.album': true,
    'share.system': true,
    'share.card.wx': false,
    'share.card.miniapp': false,
    'copy.link': true,
    'preview.longpress': false,
  }),
  'browser:windows': Object.freeze({
    'save.album': true,
    'share.system': true,
    'share.card.wx': false,
    'share.card.miniapp': false,
    'copy.link': true,
    'preview.longpress': false,
  }),
  'pwa-standalone:ios': Object.freeze({
    'save.album': false,
    'share.system': true,
    'share.card.wx': false,
    'share.card.miniapp': false,
    'copy.link': true,
    'preview.longpress': true,
  }),
  'pwa-standalone:android': Object.freeze({
    'share.system': true,
    'share.card.wx': false,
    'share.card.miniapp': false,
    'copy.link': true,
    'preview.longpress': true,
  }),
})

/** 未实测格子的取值：可用性未知（不是 false），证据等级与置信度如实标注 */
function untestedCell() {
  return Object.freeze({ available: null, confidence: 'unknown', evidence: '未实测' })
}

/** 文档级格子的取值：available true 时 confidence 一律 low（文档不构成高置信） */
function documentedCell(available) {
  return Object.freeze({ available, confidence: 'low', evidence: '仅文档' })
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

/** 能力表：环境键 → 六项动作的取值（42 格全成格，缺依据的格子也成格并标未实测） */
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
  return ACTION_IDS.every((actionId) => row && row[actionId] && row[actionId].evidence === '未实测')
}
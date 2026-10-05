/**
 * decide.mjs — 动作决策与提示计划（R2、R4、R5、R7、R8、R10、R16）
 *
 * 输入指纹与产物种类，输出**执行计划**：`{ primary, hint, fallback, reason }`。
 * 决策只读能力表与三张本模块导出的表（产物偏好序、产物动作闸、事前提示表），
 * 代码里不写任何「哪个环境给哪个动作」的分支——加环境只加表行，不加 if。
 *
 * 红线：本文件不出现任何平台接口名（平台差异一律经能力表与信号闸表达）。
 *
 * 关于置信度：能力表每格自带 confidence，本模块**不把它外抛**，而是把它转成可观察的行为——
 * 证据不足（未实测 / 未知环境 / 仅靠运行时探测信号推断）时不出强引导文案，只给中性说明。
 * 这样「降低置信度」不是一句注释，而是单测能断言的结果。
 */

import { isArtifactKind } from './actions.mjs'
import { CONTAINER_LABELS, COPY } from './copy.mjs'
import { capabilityRowFor, envKeyFor, isAvailable, isUntestedRow } from './capability-table.mjs'

/** 兜底动作：复制链接不依赖任何宿主能力，任何环境都能做（R10） */
export const FALLBACK_ACTION = 'copy.link'

/** 不受能力表证据约束的动作：它们不依赖宿主能力，故未实测格里也能兜底 */
export const UNCONDITIONAL_ACTIONS = Object.freeze([FALLBACK_ACTION])

/**
 * 信号兜底表：能力表给不出可用动作时，图片 / 视频仍有一条**当场可探**的路——直接下载。
 *
 * 依据不是文档猜测，而是运行时信号（`hasDownloadAttr !== false` 才走，探不到仍退回复制链接），
 * 所以未实测环境也能用——R16 只禁「强引导」，而下载这个动作自明、不需要引导（hint 为 null）。
 * 口径来源（2026-09-18 出资人）：「能分享才给分享，不能分享就走下载」——PC 微信打开海报页
 * 此前既无分享、又被判下载不可用，只能复制链接，而复制到的是页面链接、不是海报图。
 * `link` 产物不在表内：链接没有「存到本地」的语义（ARTIFACT_ACTION_GATES 同此口径）。
 */
export const SIGNAL_FALLBACK = Object.freeze({
  image: 'save.album',
  video: 'save.album',
})

/** reason 短码（机器可读，不是给用户看的文案） */
export const REASON_CODES = Object.freeze({
  primaryAvailable: 'primary-available', // 命中该环境的可用动作
  fallbackOnly: 'fallback-only', // 该环境没有更强的动作，落复制链接
  unknownEnv: 'unknown-env', // 环境未实测 / 维度判不出，中性兜底
  artifactNotSupported: 'artifact-not-supported', // 该环境的动作都带不动这种产物（如微信内视频）
  signalGated: 'signal-gated', // 运行时信号否决了首选动作
  signalFallback: 'signal-fallback', // 表里给不出动作，靠运行时信号落到下载
  noArtifactKind: 'no-artifact-kind', // 产物种类非法 / 缺失
})

/**
 * 「操作与直觉不一致」的环境枚举（R6：事前说明只在这些环境出现）。
 * 微信系（要长按或复制，不是点一下就好）与 iOS 系（面板里还要再选一次才真的存下来）。
 */
export const INTUITIVE_CONFLICT_ENVS = Object.freeze([
  'wechat:ios',
  'wechat:android',
  'wechat-desktop:macos',
  'wechat-desktop:windows',
  'wechat-miniprogram-webview:ios',
  'wechat-miniprogram-webview:android',
  'browser:ios',
  'pwa-standalone:ios',
])

/** 事前提示表：`<环境键>|<产物种类>` → 文案 id；未列出的环境不出事前说明 */
export const PRE_HINTS = Object.freeze({
  'wechat:ios|image': 'longpress-image',
  'wechat:android|image': 'longpress-image',
  'wechat:ios|video': 'external-open-video',
  'wechat:android|video': 'external-open-video',
  // 微信系（含 PC）link 产物落到 share.card.wx：点按钮不会弹分享面板，必须走右上角菜单，
  // 与直觉不一致 → 出事前说明。2026-09-18 首次真实接入时补（此前只有图片/视频有 link 缺失）。
  'wechat:ios|link': 'card-wx-link',
  'wechat:android|link': 'card-wx-link',
  'wechat-desktop:macos|link': 'card-wx-link',
  'wechat-desktop:windows|link': 'card-wx-link',
  'browser:ios|image': 'share-system-image',
  'browser:ios|video': 'share-system-video',
  'pwa-standalone:ios|image': 'share-system-image',
  'pwa-standalone:ios|video': 'share-system-video',
})

/** 中性说明（证据不足时唯一允许的提示，不含强引导） */
export const NEUTRAL_HINT_IDS = Object.freeze({
  image: 'copy-link-image',
  video: 'copy-link-video',
  link: 'copy-link-link',
})

/**
 * 产物偏好序：同一环境里可用的动作可能不止一个，按此顺序取第一个。
 * 系统分享面板排在直接下载之前——它是唯一「既能存又能分享」的统一出口，
 * 而 iOS 上直接下载只落「文件」App、不进相册。
 */
export const ARTIFACT_PREFERENCE = Object.freeze({
  image: Object.freeze(['share.system', 'save.album', 'preview.longpress', 'share.card.wx', 'copy.link']),
  video: Object.freeze(['share.system', 'save.album', 'share.card.wx', 'copy.link']),
  link: Object.freeze(['share.system', 'share.card.wx', 'share.card.miniapp', 'copy.link']),
})

/**
 * 产物动作闸：动作能不能带得动这种产物（与「环境能不能用这个动作」正交）。
 * - preview.longpress 只对图片成立：长按视频没有保存菜单项；
 * - save.album 只对图片与视频成立：链接没有「存到本地」的语义；
 * - share.card.wx 只对链接成立：微信内只能预设链接卡片，卡片带不动文件；
 * - share.card.miniapp 只对链接与图片成立：小程序的图片分享菜单带不动视频。
 */
export const ARTIFACT_ACTION_GATES = Object.freeze({
  'preview.longpress': Object.freeze(['image']),
  'save.album': Object.freeze(['image', 'video']),
  'share.card.wx': Object.freeze(['link']),
  'share.card.miniapp': Object.freeze(['link', 'image']),
})

/**
 * 运行时信号闸：信号明确否决时，该动作在这一刻不可用。share.system 的否决按产物区分：
 * - `hasShare === false`（宿主无系统分享接口，如 Firefox / Safari 桌面）→ 所有产物都闸（执行必失败）；
 * - `canShareFiles === false` 只闸**要带文件**的产物（image / video）——link 不带文件，
 *   桌面 Chrome 文件分享探否但链接分享本可用，不得过杀
 *   （2026-10-05 修复：此前无差别闸掉了 link 的系统分享，与能力表 browser 桌面行矛盾）。
 */
function signalsAllow(actionId, signals, artifactKind) {
  const s = signals && typeof signals === 'object' ? signals : {}
  if (actionId === 'share.system') {
    if (s.hasTransientActivation === false) return false
    if (s.hasShare === false) return false
    if (s.canShareFiles === false && artifactKind !== 'link') return false
  }
  if (actionId === 'save.album' && s.hasDownloadAttr === false) return false
  return true
}

/** 产物闸：未列入闸表的动作对所有产物种类开放 */
function artifactAllows(actionId, artifactKind) {
  const allowed = ARTIFACT_ACTION_GATES[actionId]
  return !allowed || allowed.includes(artifactKind)
}

/** 组装文案占位参数（只填该文案确实声明需要的键） */
function buildParams(copyId, fingerprint) {
  const entry = COPY[copyId]
  if (!entry || entry.params.length === 0) return {}
  const containerKey = fingerprint && typeof fingerprint === 'object' ? fingerprint.container : null
  const out = {}
  for (const key of entry.params) {
    if (key === 'container') out.container = CONTAINER_LABELS[containerKey] || CONTAINER_LABELS.unknown
  }
  return out
}

/**
 * 选事前说明：
 * - 未实测 / 未知环境 → 只给中性说明（R16）；
 * - 命中「操作与直觉不一致」环境 → 给该环境该产物的强引导；
 * - 其余情况（动作符合直觉）→ 不给事前说明。
 */
function pickHint(envKey, artifactKind, primary, untested, fingerprint) {
  if (untested) return { tier: 'pre', copyId: NEUTRAL_HINT_IDS[artifactKind], params: {} }
  const strong = PRE_HINTS[`${envKey}|${artifactKind}`]
  if (strong && INTUITIVE_CONFLICT_ENVS.includes(envKey)) {
    return { tier: 'pre', copyId: strong, params: buildParams(strong, fingerprint) }
  }
  if (primary === FALLBACK_ACTION) {
    const neutral = NEUTRAL_HINT_IDS[artifactKind]
    return { tier: 'pre', copyId: neutral, params: buildParams(neutral, fingerprint) }
  }
  return null
}

/** 中性执行计划（产物种类非法时的兜底：只给复制链接，如实说明） */
function neutralPlan(reason) {
  const copyId = NEUTRAL_HINT_IDS.link
  return {
    primary: FALLBACK_ACTION,
    hint: { tier: 'pre', copyId, params: {} },
    fallback: null,
    reason,
  }
}

/**
 * 收集该环境**此刻**可用的动作（偏好序），decideAction 与 listActions 的共享单源。
 *
 * 三重过滤：能力表（isAvailable）× 产物闸（artifactAllows）× 信号闸（signalsAllow）；
 * 无条件动作（copy.link）跳过三闸恒入列，因此返回列表永不为空。
 * 信号兜底口径与 decideAction 原实现一致：能力表给不出比 copy.link 更强的动作、
 * 且运行时信号探得可下载时，image/video 把 save.album 插到 copy.link 之前。
 */
function availableActions(artifactKind, row, signals) {
  const out = []
  let gatedByArtifact = false
  let gatedBySignal = false
  let signalFallbackUsed = false

  for (const actionId of ARTIFACT_PREFERENCE[artifactKind]) {
    if (UNCONDITIONAL_ACTIONS.includes(actionId)) {
      out.push(actionId)
      continue
    }
    if (!isAvailable(row[actionId])) continue
    if (!artifactAllows(actionId, artifactKind)) {
      gatedByArtifact = true
      continue
    }
    if (!signalsAllow(actionId, signals, artifactKind)) {
      gatedBySignal = true
      continue
    }
    out.push(actionId)
  }

  // 信号兜底：列表里只剩无条件动作时才试。必须有信号才算「当场探过」——
  // 没传 signals 的调用（如首帧计划）不猜，仍只有复制链接。
  // 能力表明确 available:false 的动作（如小程序 web-view 不能写相册）不得被特性探测推翻：
  // a[download] 属性存在不代表下载不被宿主屏蔽，文档级否决优先于运行时信号（红线 2/5）。
  if (out.every((id) => UNCONDITIONAL_ACTIONS.includes(id))) {
    const fb = SIGNAL_FALLBACK[artifactKind]
    const docDenied = fb && row[fb] && row[fb].available === false
    if (fb && !docDenied && signals && typeof signals === 'object' && signalsAllow(fb, signals, artifactKind)) {
      out.unshift(fb)
      signalFallbackUsed = true
    }
  }

  return { out, gatedByArtifact, gatedBySignal, signalFallbackUsed }
}

/** reason 归因（两个决策入口共用同一套短码语义） */
function reasonOf(out, gatedByArtifact, gatedBySignal, signalFallbackUsed, untested) {
  if (signalFallbackUsed) return REASON_CODES.signalFallback
  // 偏好序下非兜底动作必排在 copy.link 之前，看首项即可
  if (out[0] !== FALLBACK_ACTION) return REASON_CODES.primaryAvailable
  if (untested) return REASON_CODES.unknownEnv
  if (gatedByArtifact) return REASON_CODES.artifactNotSupported
  if (gatedBySignal) return REASON_CODES.signalGated
  return REASON_CODES.fallbackOnly
}

/**
 * 决策入口。`fingerprint` 来自 `normalizeFingerprint`，`artifactKind` 为 image / video / link，
 * `signals` 可选（适配包采集的原始信号，用于运行时否决）。
 * 纯函数：不改入参、无副作用、同输入同输出；非法入参返回兜底计划而不是抛错。
 */
export function decideAction(input) {
  const { fingerprint, artifactKind, signals } = input && typeof input === 'object' ? input : {}
  if (!isArtifactKind(artifactKind)) return neutralPlan(REASON_CODES.noArtifactKind)

  const envKey = envKeyFor(fingerprint)
  const row = capabilityRowFor(fingerprint)
  const untested = isUntestedRow(row)

  const { out, gatedByArtifact, gatedBySignal, signalFallbackUsed } = availableActions(artifactKind, row, signals)
  const primary = out[0] // copy.link 恒在列，out 永不为空

  return {
    primary,
    // 下载是自明的动作，不需要事前说明；也不能拿中性文案（「复制链接…」）冒充它的说明
    hint: signalFallbackUsed ? null : pickHint(envKey, artifactKind, primary, untested, fingerprint),
    fallback: primary === FALLBACK_ACTION ? null : FALLBACK_ACTION,
    reason: reasonOf(out, gatedByArtifact, gatedBySignal, signalFallbackUsed, untested),
  }
}

/**
 * 列出该环境**此刻**真实可用的全部动作（Action Sheet 的决策单源，红线 2）。
 *
 * 输入与 decideAction 相同；输出 `{ actions: [{ id, isPrimary }], reason }`：
 * - `actions` 按产物偏好序排列，第一项即主推荐（isPrimary: true），其余为次要项；
 * - copy.link 恒在列；若它是唯一项，主推荐落在它身上；
 * - 信号兜底与 decideAction 同口径（能力表全灭 + 运行时探得可下载 → save.album 入列）；
 * - share.system 受 hasTransientActivation 信号闸：**首帧调用时它通常不在列**，
 *   必须在点击瞬间（一次性用户激活为 true 时）重调本函数，才能拿到含系统分享的完整列表。
 */
export function listActions(input) {
  const { fingerprint, artifactKind, signals } = input && typeof input === 'object' ? input : {}
  if (!isArtifactKind(artifactKind)) {
    return { actions: [{ id: FALLBACK_ACTION, isPrimary: true }], reason: REASON_CODES.noArtifactKind }
  }

  const row = capabilityRowFor(fingerprint)
  const untested = isUntestedRow(row)
  const { out, gatedByArtifact, gatedBySignal, signalFallbackUsed } = availableActions(artifactKind, row, signals)

  return {
    actions: out.map((id, i) => ({ id, isPrimary: i === 0 })),
    reason: reasonOf(out, gatedByArtifact, gatedBySignal, signalFallbackUsed, untested),
  }
}
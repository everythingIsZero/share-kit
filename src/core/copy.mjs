/**
 * copy.mjs — 文案表（单源数据，R8）
 *
 * 文案由 core 输出、各端只负责渲染：core 出 `{ copyId, params }`，适配包按 id 取正文并做占位替换。
 * 项目可覆盖，但覆盖集中在 `resolveCopy` 一处并必须附原因（override.reason）。
 *
 * 红线（R8）：默认正文只描述「结果 + 位置」，不点出系统菜单项名称——菜单项名随系统版本变化，
 * 写死必失效。只有「已验证 + 有原因」的覆盖条目才允许携带 `verifiedMenuItem`，且它只作补充、
 * 不替代正文。默认正文的禁用词表见 `DEFAULT_MENU_TERM_DENYLIST`，单测逐词扫描（Unit 1 第 2 条）。
 *
 * 本文件零宿主依赖（R3）。
 */

import { ACTIONS } from './actions.mjs'

/**
 * 默认正文禁用词：系统菜单项名称与「保存图片」这类被平台口径污染的表述。
 * 新增文案若命中此表，单测直接红——不是靠人记得。
 */
export const DEFAULT_MENU_TERM_DENYLIST = Object.freeze([
  '存储图像',
  '存储视频',
  '存储到文件',
  '转发给朋友',
  '发送给朋友',
  '保存图片',
])

/** 文案出现时机：事前（pre）/ 点按时（click）/ 失败时（fail）/ 结果（result） */
export const COPY_TIERS = Object.freeze(['pre', 'click', 'fail', 'result'])

/**
 * copyId 允许的短码前缀 = 动作枚举的 shortCode ∪ 以下非动作短码。
 * 命名规范：`<短码>-<内容>`，如 `longpress-image`、`external-open-video`。
 */
export const COPY_SHORT_CODES = Object.freeze([
  ...Object.values(ACTIONS).map((a) => a.shortCode),
  'external-open', // 「去外部浏览器」引导（不是动作，是引导）
  'click', // 点按中的进度指示（无障碍文案，不改按钮文案）
  'fail', // 失败时的一步引导
  'done', // 确实拿到成功结果时的结果文案
])

/**
 * 容器展示名（供文案占位 `{container}` 用）。
 * 只在「如实说明原因」的文案里出现，不参与任何决策分支。
 */
export const CONTAINER_LABELS = Object.freeze({
  wechat: '微信',
  'wechat-desktop': '微信电脑版',
  'wechat-miniprogram-webview': '微信小程序',
  douyin: '抖音',
  browser: '当前浏览器',
  'pwa-standalone': '桌面应用',
  unknown: '当前环境',
})

/**
 * 强引导文案 id：明确告诉用户「怎么做」的条目。
 * 证据不足（未实测 / 未知环境）时不得出现这些 id，只能给中性说明（引 R16）。
 */
export const STRONG_GUIDANCE_COPY_IDS = Object.freeze([
  'longpress-image',
  'external-open-video',
  'save-album-image',
  'save-album-video',
])

/**
 * 文案表：id → { id, text, params, tier, verifiedMenuItem }
 * - `text` 为中文正文模板，`{key}` 占位由 `renderCopy` 替换；
 * - `params` 列出该模板需要的占位键；
 * - `verifiedMenuItem` 默认 null，只有已验证覆盖才可填（见 `resolveCopy`）。
 */
export const COPY = Object.freeze({
  // save.album = **系统面板保存**（navigator.share({files}) → 相册/文件），文案才可说「相册」；
  // 不得承诺相册而落下载——`a[download]` 的下载动作（save.download）另有文案，落点是下载目录。
  'save-album-image': Object.freeze({ id: 'save-album-image', text: '会保存到相册', params: Object.freeze([]), tier: 'pre', verifiedMenuItem: null }),
  'save-album-video': Object.freeze({ id: 'save-album-video', text: '会保存到相册或文件', params: Object.freeze([]), tier: 'pre', verifiedMenuItem: null }),
  // save.download = **a[download] 直接下载**，落点是本机下载目录，视频尤其永远进不了相册。
  'save-download-image': Object.freeze({ id: 'save-download-image', text: '会下载到本机', params: Object.freeze([]), tier: 'pre', verifiedMenuItem: null }),
  'save-download-video': Object.freeze({ id: 'save-download-video', text: '会下载到本机', params: Object.freeze([]), tier: 'pre', verifiedMenuItem: null }),
  'share-system-image': Object.freeze({ id: 'share-system-image', text: '在系统面板里选保存到相册', params: Object.freeze([]), tier: 'pre', verifiedMenuItem: null }),
  'share-system-video': Object.freeze({ id: 'share-system-video', text: '在系统面板里选保存位置或目标应用', params: Object.freeze([]), tier: 'pre', verifiedMenuItem: null }),
  // 微信系只有 link 产物会落到 share.card.wx（见 ARTIFACT_ACTION_GATES：卡片带不动文件），
  // 因此只保留 link 变体；曾有的 card-wx-image / card-wx-video / card-miniapp-image 因闸门
  // 永远不可达，2026-09-18 首次真实接入时删除（死条目会让人误以为已覆盖图片场景）。
  'card-wx-link': Object.freeze({ id: 'card-wx-link', text: '点右上角「···」，把这一页发给朋友', params: Object.freeze([]), tier: 'pre', verifiedMenuItem: null }),
  // M2-6：url 是**带卡片的短链**（share.hxym18.com/s/<id>，share-bridge 中转页产 og / JS-SDK 卡片）
  // 时，微信内 link 的事前说明改用此条——卡片已随链接带出，用户只需复制转达，不必走右上角菜单。
  // 与 card-wx-link 并列、各说各的路径，**不得互相覆盖**（选哪条由 decide 的 cardShare 分流）。
  'card-wx-shortlink': Object.freeze({ id: 'card-wx-shortlink', text: '链接自带卡片：复制后发给微信好友即可（对方看到卡片）', params: Object.freeze([]), tier: 'pre', verifiedMenuItem: null }),
  // 小程序 web-view 里 H5 调不起原生分享，转发由**宿主小程序自带**的分享菜单负责，故给这一步引导。
  // 与 card-wx-link 分开：两者宿主菜单位置/措辞不同，tip 按动作选文案（S11）。
  // 注：share.card.miniapp 目前在能力表所有行都不可用（暂不可达）；保留此条供未来开放时使用。
  'card-miniapp-link': Object.freeze({ id: 'card-miniapp-link', text: '点右上角「···」，用小程序自带的分享', params: Object.freeze([]), tier: 'pre', verifiedMenuItem: null }),
  'longpress-image': Object.freeze({ id: 'longpress-image', text: '长按这张图，选保存到相册', params: Object.freeze([]), tier: 'pre', verifiedMenuItem: null }),
  'external-open-video': Object.freeze({ id: 'external-open-video', text: '这条视频在{container}里存不下来，复制链接到手机浏览器打开', params: Object.freeze(['container']), tier: 'pre', verifiedMenuItem: null }),
  'copy-link-image': Object.freeze({ id: 'copy-link-image', text: '这里存不了，复制链接换个地方打开', params: Object.freeze([]), tier: 'pre', verifiedMenuItem: null }),
  'copy-link-video': Object.freeze({ id: 'copy-link-video', text: '复制链接，到浏览器里打开就能存', params: Object.freeze([]), tier: 'pre', verifiedMenuItem: null }),
  'copy-link-link': Object.freeze({ id: 'copy-link-link', text: '复制链接，粘到浏览器或发给朋友打开', params: Object.freeze([]), tier: 'pre', verifiedMenuItem: null }),
  'click-progress': Object.freeze({ id: 'click-progress', text: '正在处理', params: Object.freeze([]), tier: 'click', verifiedMenuItem: null }),
  'fail-retry': Object.freeze({ id: 'fail-retry', text: '没能完成，可以再点一次', params: Object.freeze([]), tier: 'fail', verifiedMenuItem: null }),
  'fail-blocked-video': Object.freeze({ id: 'fail-blocked-video', text: '这个环境存不了视频，复制链接到浏览器打开', params: Object.freeze([]), tier: 'fail', verifiedMenuItem: null }),
  'fail-guidance-image': Object.freeze({ id: 'fail-guidance-image', text: '长按图片，选保存到相册', params: Object.freeze([]), tier: 'fail', verifiedMenuItem: null }),
  // S3：非公开分享链（私有页 / 带 token）不得复制或分享出去——拒绝执行并如实说明，不静默。
  'fail-private-url': Object.freeze({ id: 'fail-private-url', text: '这条链接不是公开分享链，不能复制或分享', params: Object.freeze([]), tier: 'fail', verifiedMenuItem: null }),
  // 只在「本包确实拿到成功结果」时渲染；走系统面板（save.album / share.system）的环境不得使用
  // （无法确知面板内发生了什么，引 R7）。save.download 是 `a[download]`，落点确定在下载目录，
  // 故可如实报「已保存到本机」——措辞用「本机」不用「相册」（2026-10-11 拆语义后改）。
  'done-saved': Object.freeze({ id: 'done-saved', text: '已保存到本机', params: Object.freeze([]), tier: 'result', verifiedMenuItem: null }),
  // 复制链接也会成为 primary（兜底动作），成功后必须如实报一声，否则用户不知道到底复制上没有（R9）。
  'done-copied': Object.freeze({ id: 'done-copied', text: '链接已复制', params: Object.freeze([]), tier: 'result', verifiedMenuItem: null }),
})

/** 全部文案 id */
export const COPY_IDS = Object.freeze(Object.keys(COPY))

/** 取一条文案；未知 id 返回 null（纯函数不抛错） */
export function getCopy(id) {
  if (typeof id !== 'string') return null
  return Object.prototype.hasOwnProperty.call(COPY, id) ? COPY[id] : null
}

/** 判 id 是否命中强引导清单 */
export function isStrongGuidance(id) {
  return STRONG_GUIDANCE_COPY_IDS.includes(id)
}

/**
 * 渲染正文：把 `{key}` 替换为 params[key]；缺失的键替换为空串（不抛错、不留半截占位符）。
 * 适配包拿到 `{ copyId, params }` 后调用本函数即可，无需自己写替换逻辑。
 */
export function renderCopy(id, params = {}) {
  const entry = getCopy(id)
  if (!entry) return ''
  const safe = params && typeof params === 'object' ? params : {}
  return entry.text.replace(/\{(\w+)\}/g, (_, key) => {
    const v = safe[key]
    return v === undefined || v === null ? '' : String(v)
  })
}

/**
 * 覆盖：默认条目 + 项目覆盖 → 生效条目（R8：覆盖必须附原因）。
 * 规则：
 * - `override.text` 覆盖正文；
 * - `override.verifiedMenuItem` 只有在「已验证 + 有原因」时才生效（须同时给 `verified: true`
 *   与 `reason`），否则丢弃该字段并在返回值的 `overrideRejected` 上留痕——菜单项名写错比不写更糟，
 *   所以宁可不生效；
 * - 生效的 `verifiedMenuItem` 一律带 `verifiedOverride: true` 标记，供调用方与走查区分。
 */
export function resolveCopy(id, override) {
  const base = getCopy(id)
  if (!base) return null
  if (!override || typeof override !== 'object') return { ...base, verifiedOverride: false, overrideRejected: false }

  const reason = typeof override.reason === 'string' ? override.reason.trim() : ''
  const wanted = typeof override.verifiedMenuItem === 'string' && override.verifiedMenuItem.length > 0
  const accepted = wanted && reason.length > 0 && override.verified === true

  return {
    ...base,
    text: typeof override.text === 'string' && override.text.length > 0 ? override.text : base.text,
    verifiedMenuItem: accepted ? override.verifiedMenuItem : base.verifiedMenuItem,
    verifiedOverride: accepted,
    overrideRejected: wanted && !accepted,
    overrideReason: reason,
  }
}
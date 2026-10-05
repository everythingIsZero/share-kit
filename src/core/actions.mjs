/**
 * actions.mjs — 动作枚举（单源数据）
 *
 * 模型是「动作能不能用」，不是平台 API 名（R2）：同一个动作在 Web / 小程序 / 自研引擎里
 * 由各自的适配包实现，core 只认这些 id，宿主差异一律不进决策层。
 *
 * 本文件零宿主依赖（R3）：只有纯数据与纯函数，不 import 任何宿主 API。
 */

/**
 * 全部合法动作（键即动作 id，键序即枚举序）。
 * shortCode 供 copyId 命名与埋点归类；family 只用于归组（save / share / fallback），不参与决策。
 *
 * 语义提醒：save.album 是「直接保存到本地」，在桌面环境落点是本机下载目录，不真的进相册。
 */
export const ACTIONS = Object.freeze({
  'save.album': Object.freeze({ shortCode: 'save-album', label: '存到相册', family: 'save' }),
  'share.system': Object.freeze({ shortCode: 'share-system', label: '拉起系统分享面板', family: 'share' }),
  'share.card.wx': Object.freeze({ shortCode: 'card-wx', label: '微信分享卡片', family: 'share' }),
  'share.card.miniapp': Object.freeze({ shortCode: 'card-miniapp', label: '小程序分享', family: 'share' }),
  'copy.link': Object.freeze({ shortCode: 'copy-link', label: '复制链接', family: 'fallback' }),
  'preview.longpress': Object.freeze({ shortCode: 'longpress', label: '长按保存', family: 'save' }),
})

/** 动作 id 全集（顺序即枚举顺序；测试按此逐项断言，新增动作必须改这里并补能力表） */
export const ACTION_IDS = Object.freeze(Object.keys(ACTIONS))

/** 产物种类：决策只按产物种类分档，不按调用方「想存还是想分享」的意图分档 */
export const ARTIFACT_KINDS = Object.freeze(['image', 'video', 'link'])

/** 判值是否为合法动作 id */
export function isActionId(v) {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(ACTIONS, v)
}

/** 判值是否为合法产物种类 */
export function isArtifactKind(v) {
  return typeof v === 'string' && ARTIFACT_KINDS.includes(v)
}
/**
 * view.mjs — Action Sheet 视图模型（纯函数，node:test 覆盖）
 *
 * core 的 `listActions` 输出动作列表；本文件把它变成可渲染的视图数据：
 * sheet 项（含用户文案与主推荐标记）与按钮文案（多项 → 通用「分享」；唯一 → 直出动作名）。
 *
 * 这里的标签是 UI 层的「方式名称」（描述这是什么方式），与 core copy 表的引导文案
 * （描述结果与位置）语义不同，故分开维护、互不污染。
 */

/**
 * 动作在 Action Sheet 里的默认标签。
 * `save.album` 按产物区分动词（保存图片 / 保存视频）；`preview.longpress` 直说结果
 * 「长按保存海报」——用户点它就是想保存，不绕「查看大图」的弯子。
 */
export const SHEET_LABELS = Object.freeze({
  'share.system': '系统分享',
  'save.album': '保存图片',
  'preview.longpress': '长按保存海报',
  'share.card.wx': '分享到微信',
  'share.card.miniapp': '小程序分享',
  'copy.link': '复制链接',
})

/** 取一个动作的标签：项目覆盖（labels.actions）优先，其次按产物区分，最后默认表 */
function labelOf(actionId, artifactKind, labels) {
  const override = labels && labels.actions && labels.actions[actionId]
  if (typeof override === 'string' && override.length > 0) return override
  if (actionId === 'save.album' && artifactKind === 'video') return '保存视频'
  return SHEET_LABELS[actionId] || actionId
}

/** `listActions` 的结果 → Action Sheet 项数据 `[{ id, label, isPrimary }]`（保持偏好序） */
export function sheetItemsOf(list, artifactKind, labels) {
  const actions = list && Array.isArray(list.actions) ? list.actions : [{ id: 'copy.link', isPrimary: true }]
  return actions.map((a) => ({
    id: a.id,
    label: labelOf(a.id, artifactKind, labels),
    isPrimary: Boolean(a.isPrimary),
  }))
}

/**
 * 按钮文案：唯一可用动作直出动作名（此时不弹列表、点击直接执行）；
 * 多个动作时给通用「分享」——具体方式由点击瞬间的列表决定，按钮不预示。
 */
export function buttonLabelOf(list, artifactKind, labels) {
  const items = sheetItemsOf(list, artifactKind, labels)
  if (items.length === 1) return items[0].label
  const custom = labels && labels.button
  return typeof custom === 'string' && custom.length > 0 ? custom : '分享'
}

/** Action Sheet 标题（labels.sheetTitle 可覆盖） */
export function sheetTitleOf(labels) {
  const custom = labels && labels.sheetTitle
  return typeof custom === 'string' && custom.length > 0 ? custom : '选择分享方式'
}

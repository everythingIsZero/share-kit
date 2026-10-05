/**
 * view.mjs — Action Sheet 视图模型（纯函数，node:test 覆盖）
 *
 * core 的 `listActions` 输出动作列表；本文件把它变成可渲染的视图数据：
 * sheet 项（含用户文案与主推荐标记）与按钮文案（image 恒通用「分享」——点击先弹预览层；
 * link / video 唯一动作时直出动作名）。
 *
 * 这里的标签是 UI 层的「方式名称」（描述这是什么方式），与 core copy 表的引导文案
 * （描述结果与位置）语义不同，故分开维护、互不污染。
 */

/**
 * 动作在方式列表里的默认标签。
 * `save.album` 按产物区分动词（保存图片 / 保存视频）；`preview.longpress` 不再渲染为
 * 按钮（预览层的大图本身可长按），标签保留仅维持续一的动作文案表完整性。
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
 * 按钮文案：图片产物点击恒先弹海报预览层（图是基本操作，唯一动作也不直出执行），
 * 一律给通用「分享」；link / video 产物保留「唯一动作直出动作名」（点击即执行，
 * 此时按钮直说动作名才是准确的预期管理）。多项时通用「分享」，可被 labels.button 覆盖。
 */
export function buttonLabelOf(list, artifactKind, labels) {
  const items = sheetItemsOf(list, artifactKind, labels)
  if (artifactKind !== 'image' && items.length === 1) return items[0].label
  const custom = labels && labels.button
  return typeof custom === 'string' && custom.length > 0 ? custom : '分享'
}

/** Action Sheet 标题（labels.sheetTitle 可覆盖） */
export function sheetTitleOf(labels) {
  const custom = labels && labels.sheetTitle
  return typeof custom === 'string' && custom.length > 0 ? custom : '选择分享方式'
}

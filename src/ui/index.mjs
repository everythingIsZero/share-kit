/**
 * index.mjs — share-kit ui 主出口（包入口 `./ui`）
 *
 * 无框架的通用分享挂载：mountShare（按钮 + 海报预览层 + Action Sheet 兜底 + 执行 + 反馈）。
 * 另导出 `isPublicShareUrl`（公开链判定）与 `isCardShareUrl`（带卡片短链判定），与 README 承诺一致。
 * 决策单源在 core（`listActions`），本入口只做组装与视图；DOM 浮层薄壳（sheet.mjs）
 * 为内部实现，不进公共出口。React 站点可直接在 ref 容器上挂载本入口。
 */

export { mountShare, isPublicShareUrl, isCardShareUrl } from './mount.mjs'
export { SHEET_LABELS, buttonLabelOf, sheetItemsOf, sheetTitleOf } from './view.mjs'

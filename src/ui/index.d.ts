/**
 * index.d.ts — share-kit ui 类型出口（与 index.mjs 同步维护）
 *
 * mountShare：无框架通用分享挂载（按钮 + 海报预览层 + Action Sheet 兜底 + 执行 + 反馈）。
 * isPublicShareUrl：公开链判定（运行期已导出，与 README 一致）。
 * isCardShareUrl：带卡片短链判定（host 是卡片承载域且本身是公开链；运行期已导出）。
 *
 * 只 re-export 公共出口：不再 `export * from './mount'`——否则会把 GUIDANCE_COPY_ID /
 * SENSITIVE_QUERY_KEYS / DEFAULT_PUBLIC_HOSTS / CARD_SHARE_HOSTS / actionUsesShareUrl 等内部常量错误地暴露为
 * `share-kit/ui` 的公共 API（运行期并不导出，类型与实现不一致）。
 */

export * from './view'
export type { ShareArtifact, ShareResult, ShareHandle } from './mount'
export { mountShare, isPublicShareUrl, isCardShareUrl } from './mount'

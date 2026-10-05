/** 动作在 Action Sheet 里的默认标签（save.album 按产物区分保存图片/保存视频） */
export const SHEET_LABELS: Readonly<Record<string, string>>

/** listActions 的结果 → Action Sheet 项数据（保持偏好序，主推荐居首） */
export function sheetItemsOf(
  list: { actions: Array<{ id: string; isPrimary: boolean }> },
  artifactKind: string,
  labels?: ShareLabels
): Array<{ id: string; label: string; isPrimary: boolean }>

/** 按钮文案：image 恒通用「分享」（点击先弹预览层）；link/video 唯一动作直出动作名（labels.button 可覆盖） */
export function buttonLabelOf(
  list: { actions: Array<{ id: string; isPrimary: boolean }> },
  artifactKind: string,
  labels?: ShareLabels
): string

/** Action Sheet 标题（labels.sheetTitle 可覆盖） */
export function sheetTitleOf(labels?: ShareLabels): string

/** 项目级文案覆盖 */
export interface ShareLabels {
  /** 按钮文案（多项动作时的通用文案） */
  button?: string
  /** Action Sheet 标题 */
  sheetTitle?: string
  /** 按动作 id 覆盖 sheet 项文案 */
  actions?: Record<string, string>
}

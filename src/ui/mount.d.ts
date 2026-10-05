import type { ShareLabels } from './view'

/** 业务交给 mountShare 的分享产物（执行时取值的可变引用） */
export interface ShareArtifact {
  kind: 'image' | 'video' | 'link'
  /** 分享链接（copy.link / 系统分享 / 卡片用；缺省取 location.href） */
  url?: string
  title?: string
  text?: string
  /** 参与文件分享的 File 列表（share.system） */
  files?: Array<File> | undefined
  /** 下载文件名（save.album） */
  filename?: string
  /** 图片直链：长按引导层大图源与下载源（缺省时用 files[0] 现造 blob URL） */
  imageUrl?: string
}

/** mountShare 的执行结果回调入参（同 web.executeAction 的结果） */
export interface ShareResult {
  ok: boolean
  outcome: string
  action: string
  mode: 'invoked' | 'guidance'
}

/** 挂载句柄 */
export interface ShareHandle {
  unmount(): void
}

export function mountShare(
  target: HTMLElement,
  options?: {
    artifact?: ShareArtifact
    labels?: ShareLabels
    onResult?: (result: ShareResult) => void
  }
): ShareHandle

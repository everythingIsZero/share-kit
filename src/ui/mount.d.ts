import type { ShareLabels } from './view'

/** 业务交给 mountShare 的分享产物（执行时取值的可变引用） */
export interface ShareArtifact {
  kind: 'image' | 'video' | 'link'
  /** 公开分享链（copy.link / 系统分享 / 卡片用）。**缺省不给 location.href**（S3：私有页不外泄） */
  url?: string
  title?: string
  text?: string
  /** 参与文件分享的 File 列表（share.system） */
  files?: Array<File> | undefined
  /** 下载源（save.album）：无 files[0] 时的备用 URL（缺省则下载失败，绝不回退页面地址） */
  fileUrl?: string
  /** 下载文件名（save.album） */
  filename?: string
  /** 图片直链：海报预览层大图源（缺省时用 files[0] 现造 blob URL） */
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

/** 引导类动作 → core 文案 id 的映射（导出仅供测试；非包公共出口） */
export declare const GUIDANCE_COPY_ID: Readonly<Record<string, string>>

export function mountShare(
  target: HTMLElement,
  options?: {
    artifact?: ShareArtifact
    labels?: ShareLabels
    onResult?: (result: ShareResult) => void
  }
): ShareHandle

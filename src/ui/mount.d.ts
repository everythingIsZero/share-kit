import type { ShareLabels } from './view'

/** 业务交给 mountShare 的分享产物（执行时取值的可变引用） */
export interface ShareArtifact {
  kind: 'image' | 'video' | 'link'
  /** 公开分享链（copy.link / 系统分享 / 卡片用）。**缺省不给 location.href**（S3：私有页不外泄） */
  url?: string
  title?: string
  text?: string
  /** 参与文件分享的 File 列表（share.system / save.album 系统面板保存） */
  files?: Array<File> | undefined
  /** 下载源（save.download）：无 files[0] 时的备用 URL（缺省则下载失败，绝不回退页面地址） */
  fileUrl?: string
  /** 下载文件名（save.download） */
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

/** 敏感 query 键：出现即判非公开分享链 */
export declare const SENSITIVE_QUERY_KEYS: readonly string[]

/** 默认公开分享域（恒在；publicHosts 只追加，不替换） */
export declare const DEFAULT_PUBLIC_HOSTS: readonly string[]

/** 判 URL 是否公开分享链（host 在允许域内 + 无敏感 query）；私有页/token/非法 URL 一律 false */
export declare function isPublicShareUrl(
  url?: string | null,
  publicHosts?: readonly string[],
  sensitiveQueryKeys?: readonly string[]
): boolean

/** 判 URL 是否**带卡片的短链**：既是公开分享链、host 又是卡片承载域（当前与默认公开域同域） */
export declare function isCardShareUrl(
  url?: string | null,
  publicHosts?: readonly string[],
  sensitiveQueryKeys?: readonly string[]
): boolean

/** 该动作是否会用到分享链（url）；share.system 有文件时用文件、不用 url */
export declare function actionUsesShareUrl(actionId: string, files?: unknown): boolean

export function mountShare(
  target: HTMLElement,
  options?: {
    artifact?: ShareArtifact
    labels?: ShareLabels
    onResult?: (result: ShareResult) => void
    /** 站点声明的公开分享域，**追加**到默认域（并集，不替换）；非公开链会被拒绝复制/分享 */
    publicHosts?: readonly string[]
    /** 站点声明的**追加**敏感 query 键（默认 `token`/`t`/`access_token` 恒在，并集追加）；带这些 query 的链会被拒绝复制/分享 */
    sensitiveQueryKeys?: readonly string[]
  }
): ShareHandle

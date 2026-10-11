export interface ShareMetadataPage {
  /** 页面路径（拼 og:url）；也接受绝对 URL */
  path: string
  title: string
  description?: string
  /** 覆盖站点默认分享图（路径或绝对 URL） */
  image?: string
  /** 覆盖图版本（换图改它，绕开平台按 URL 缓存） */
  imageVersion?: string
  /** 覆盖站点默认；false 时输出 index/follow */
  noindex?: boolean
  type?: string
  siteName?: string
}

export interface ShareMetadataConfig {
  /** 站点绝对 origin（og:url / og:image 的基准），必填 */
  origin: string
  /** 分享图：路径或绝对 URL，必填 */
  image: string
  siteName?: string
  /** 图版本：换图改它（按 URL 缓存），或用版本化文件名 */
  imageVersion?: string
  imageWidth?: number
  imageHeight?: number
  imageAlt?: string
  locale?: string
  /** 默认 true：分享/私密页不进索引 */
  noindex?: boolean
  type?: string
  twitterCard?: string
}

/** 产出 Next `Metadata` 兼容的普通对象（无 undefined 键，可 JSON 序列化） */
export declare function createShareMetadata(
  config: ShareMetadataConfig,
): (page: ShareMetadataPage) => Record<string, unknown>

/** 长度体检（不截断，只报告是否超建议上限） */
export declare function describeLength(text?: string): {
  length: number
  titleTooLong: boolean
  descriptionTooLong: boolean
}

export declare const OG_IMAGE_WIDTH: number
export declare const OG_IMAGE_HEIGHT: number
export declare const OG_TITLE_MAX: number
export declare const OG_DESCRIPTION_MAX: number

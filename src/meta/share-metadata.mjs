/**
 * share-metadata.mjs — 分享卡片元信息（og / twitter / robots）的**单源默认 + 传参覆盖**
 *
 * 为什么在 share（而不是每站手写）：卡片能不能出、图能不能抓到，取决于几条**固定规则**
 * （研究结论，见 `knowledge/integration/specs/2026-10-11-share-shortlink-design.md`）：
 *   ① 主路径是抓取器读**目标页**的 `og:*`（不是 JS-SDK）；
 *   ② `og:image` 必须**绝对地址 + 公网匿名可取**（挂登录/防盗链 → 卡片无图）；
 *   ③ 图片按 **URL 缓存** → 换图必须换 URL（换文件名或加 `v=`）；
 *   ④ 建议 **1200×630**；
 *   ⑤ 分享页通常要 `noindex`。
 * 把这些固化进默认值，站点只声明一次「我是谁 + 我的图」，页面只给内容。
 *
 * 零依赖纯函数，产出**普通对象**（Next `Metadata` 兼容子集），可 JSON 序列化、无 `undefined` 键。
 */

/** 默认图片尺寸（业界推荐比例） */
export const OG_IMAGE_WIDTH = 1200
export const OG_IMAGE_HEIGHT = 630

/** 文本长度建议（超出不截断，只由 `describeLength` 报告；抓取器会自行截断） */
export const OG_TITLE_MAX = 60
export const OG_DESCRIPTION_MAX = 160

function isHttpUrl(v) {
  return typeof v === 'string' && /^https?:\/\//i.test(v)
}

/** 把 path 或绝对 URL 拼成绝对 URL；origin 必须是绝对 http(s) */
function absolutize(origin, value, what) {
  if (typeof value !== 'string' || value === '') throw new TypeError(`${what} 必填（路径或绝对 URL）`)
  if (isHttpUrl(value)) return value
  if (!isHttpUrl(origin)) throw new TypeError(`origin 必填且须为绝对 http(s) URL（用于把 ${what} 变绝对），收到 ${JSON.stringify(origin)}`)
  return `${String(origin).replace(/\/+$/, '')}/${String(value).replace(/^\/+/, '')}`
}

/** 图片 URL 加版本（按 URL 缓存 → 加 v 即换 URL；也可用版本化文件名） */
function withVersion(imageUrl, version) {
  if (version == null || version === '') return imageUrl
  const sep = imageUrl.includes('?') ? '&' : '?'
  return `${imageUrl}${sep}v=${encodeURIComponent(String(version))}`
}

/**
 * 造一个「站点级」元信息工厂：站点声明一次，页面按内容调用。
 *
 * ```ts
 * // lib/share-meta.ts（每站一个文件，声明一次）
 * export const shareMetadata = createShareMetadata({
 *   origin: 'https://fang.hxym18.com',
 *   siteName: '房屋出租账本',
 *   image: '/og/share-v1.png',
 *   imageVersion: 'v1',        // 换图就改这里（或改文件名）
 * })
 * // 页面
 * export async function generateMetadata({ params }) {
 *   return shareMetadata({ path: `/s/${params.token}`, title, description })
 * }
 * ```
 *
 * @param {{
 *   origin: string,            // 站点绝对 origin（og:url / og:image 的基准）
 *   image: string,             // 分享图：路径或绝对 URL（绝对地址 + 匿名可取，见文件头②）
 *   siteName?: string,         // og:site_name
 *   imageVersion?: string,     // 图版本（换图改它，绕开平台按 URL 缓存）
 *   imageWidth?: number, imageHeight?: number,
 *   imageAlt?: string,
 *   locale?: string,           // 默认 zh_CN
 *   noindex?: boolean,         // 默认 true（分享/私密页不进索引）
 *   type?: string,             // og:type，默认 'website'
 *   twitterCard?: string,      // 默认 'summary_large_image'
 * }} config
 */
export function createShareMetadata(config) {
  const c = config || {}
  if (!isHttpUrl(c.origin)) throw new TypeError('createShareMetadata: origin 必填且须为绝对 http(s) URL')
  if (typeof c.image !== 'string' || c.image === '') throw new TypeError('createShareMetadata: image 必填（路径或绝对 URL）')
  const origin = String(c.origin).replace(/\/+$/, '')
  const imageBase = absolutize(origin, c.image, 'image')
  const width = Number.isFinite(c.imageWidth) ? c.imageWidth : OG_IMAGE_WIDTH
  const height = Number.isFinite(c.imageHeight) ? c.imageHeight : OG_IMAGE_HEIGHT
  const noindex = c.noindex !== false
  const type = c.type || 'website'
  const locale = c.locale || 'zh_CN'
  const twitterCard = c.twitterCard || 'summary_large_image'

  /** @param {{ path: string, title: string, description?: string, image?: string, imageVersion?: string, noindex?: boolean, type?: string, siteName?: string }} page */
  return function shareMetadata(page) {
    const p = page || {}
    if (typeof p.path !== 'string' || p.path === '') throw new TypeError('shareMetadata: path 必填（用于 og:url）')
    if (typeof p.title !== 'string' || p.title === '') throw new TypeError('shareMetadata: title 必填')
    const url = absolutize(origin, p.path, 'path')
    const description = typeof p.description === 'string' && p.description !== '' ? p.description : undefined
    const img = withVersion(p.image ? absolutize(origin, p.image, 'image') : imageBase, p.imageVersion != null ? p.imageVersion : c.imageVersion)
    const idx = p.noindex === undefined ? noindex : p.noindex !== false

    /** 只产出有值的键（无 undefined），Next Metadata 兼容子集 */
    const out = {
      title: p.title,
      ...(description ? { description } : {}),
      openGraph: {
        title: p.title,
        ...(description ? { description } : {}),
        url,
        type: p.type || type,
        siteName: p.siteName || c.siteName || undefined,
        locale,
        images: [{ url: img, width, height, ...(c.imageAlt ? { alt: c.imageAlt } : {}) }],
      },
      twitter: {
        card: twitterCard,
        title: p.title,
        ...(description ? { description } : {}),
        images: [img],
      },
      robots: { index: !idx, follow: !idx },
    }
    // 去掉值为 undefined 的键（siteName 可选）
    if (out.openGraph.siteName === undefined) delete out.openGraph.siteName
    return out
  }
}

/** 长度体检（超建议上限时报告；不截断——抓取器会自行截断，静默截断反而骗人） */
export function describeLength(text) {
  const s = typeof text === 'string' ? text : ''
  return {
    length: [...s].length,
    titleTooLong: [...s].length > OG_TITLE_MAX,
    descriptionTooLong: [...s].length > OG_DESCRIPTION_MAX,
  }
}

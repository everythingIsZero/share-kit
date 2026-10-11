/**
 * share-url.mjs — 公开分享链策略（S3；中性模块，零依赖）
 *
 * 单源落点：判断「这条 URL 能不能作为分享链交出去」的策略在此定义，
 * `web/execute.mjs`（执行闸门）与 `ui/mount.mjs`（列项 / 提前拦截）共用同一实现。
 * 闸门因此落在**最低公共层**——任何自组 UI（`core.listActions` + `web.executeAction`）都
 * 自动受控，不经 `mountShare` 也绕不过去。
 *
 * M2-6：「带卡片的短链」判定（`isCardShareUrl` / `CARD_SHARE_HOSTS`）同在此文件，
 * 与公开链闸门一样是单源——`core/decide.mjs` 的引导文案分流不重复写域名单。
 *
 * 本模块不碰宿主对象（只看 URL 字符串），可在 node:test 下完整覆盖。
 */

/** 敏感 query 键：出现即判非公开（私有页常带 token 之类，绝不能被复制/分享出去） */
export const SENSITIVE_QUERY_KEYS = Object.freeze(['token', 't', 'access_token'])

/** 默认公开分享域（**恒在**；`publicHosts` 只在其上追加，绝不替换） */
export const DEFAULT_PUBLIC_HOSTS = Object.freeze(['share.hxym18.com'])

/**
 * 卡片承载域（M2-6）：`share-bridge` 中转服务的域。站点在服务端注册短链
 * （`POST https://share.hxym18.com/api/shares`）拿到 `shareId`，公开短链
 * `https://share.hxym18.com/s/<shareId>` 直接作为 `artifact.url` 交出去——
 * 卡片由中转页的 og meta（主路径）与 JS-SDK（尽力）产出，share-kit 只负责**认出**它。
 *
 * 与 `DEFAULT_PUBLIC_HOSTS` 是两个概念（公开白名单 vs 卡片承载域），当前恰好同域；
 * 判定的**单源**本就在本文件，别处不得复制这份域名单。
 */
export const CARD_SHARE_HOSTS = Object.freeze(['share.hxym18.com'])

/**
 * 判一个 URL 是否**公开分享链**（S3）。仅当同时满足：host 在允许域内、且不含敏感 query。
 * 私有页 / 带 token / 非允许域 / 非法 URL / 空串一律 false——分享与复制只允许公开链，
 * 页面地址（`location.href` 之类）天然不满足，从而杜绝私有页外泄。
 *
 * **允许域 = DEFAULT_PUBLIC_HOSTS ∪ publicHosts**：默认域恒在，`publicHosts` 只作**追加**
 * 的站点公开域（传 `[location.hostname]` 不会关掉默认闸门，也不会放行任意域）。
 *
 * **敏感键 = SENSITIVE_QUERY_KEYS ∪ sensitiveQueryKeys**：默认键恒在，`sensitiveQueryKeys`
 * 只作**追加**（站点自己的 `sig` / `code` 之类私有签名键）；传空数组 / 替换清单都不会关掉默认键。
 *
 * @param url                待判 URL
 * @param publicHosts        站点声明的**追加**公开域列表（另有默认域与**本站 origin**，三者只加不减）
 * @param sensitiveQueryKeys 站点声明的**追加**敏感 query 键列表（大小写不敏感；默认键恒在）
 */
/**
 * 运行时**本站 origin 的 host**（浏览器里自动合法；Node/SSR 下返回 `''`）。
 *
 * 为什么默认带上本站：分享「自己页面」是正常行为——站点自己的分享页（如 `fang.hxym18.com/s/<token>`）
 * 本就该能交出去。S3 要防的是**误把私有页当分享链**（根因是 `artifact.url || location.href` 回退，
 * 已移除），不是禁止分享自身域；靠前缀清单否定会把分享页本身也否掉（v1 的病）。
 * 跨域 / 短链域仍须显式经 `publicHosts` 声明。
 */
export function ownOriginHost() {
  try {
    if (typeof location === 'undefined' || !location || !location.href) return ''
    return new URL(location.href).hostname
  } catch {
    return ''
  }
}

export function isPublicShareUrl(url, publicHosts = DEFAULT_PUBLIC_HOSTS, sensitiveQueryKeys = SENSITIVE_QUERY_KEYS) {
  if (typeof url !== 'string' || url.length === 0) return false
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  const extraHosts = Array.isArray(publicHosts) ? publicHosts.filter((h) => typeof h === 'string' && h.length > 0) : []
  // 默认域 ∪ **本站 origin**（浏览器）∪ 站点追加域；三者只能加不能减
  const hosts = new Set([...DEFAULT_PUBLIC_HOSTS, ownOriginHost(), ...extraHosts].filter(Boolean))
  if (!hosts.has(parsed.hostname)) return false
  const extraKeys = Array.isArray(sensitiveQueryKeys)
    ? sensitiveQueryKeys.filter((k) => typeof k === 'string' && k.length > 0).map((k) => k.toLowerCase())
    : []
  const sensitive = new Set([...SENSITIVE_QUERY_KEYS, ...extraKeys])
  for (const key of parsed.searchParams.keys()) {
    if (sensitive.has(key.toLowerCase())) return false
  }
  return true
}

/**
 * 判 URL 是否**带卡片的短链**（M2-6）：既要是合法公开分享链（过 `isPublicShareUrl` 的
 * host + 无敏感 query 双闸），host 又要在**卡片承载域**（`CARD_SHARE_HOSTS`）内。
 *
 * 站点追加的普通公开域（`publicHosts`）**不算**卡片短链——那些域没有中转页产卡片，
 * 微信内 link 仍应走既有的「点右上角『···』」引导。判定只读 URL 字符串，零宿主依赖。
 *
 * @param url                待判 URL
 * @param publicHosts        站点追加的公开域（转发给 `isPublicShareUrl`；卡片域单源在 `CARD_SHARE_HOSTS`，不由此参数扩展）
 * @param sensitiveQueryKeys 站点追加的敏感 query 键（转发给 `isPublicShareUrl`；默认键恒在）
 */
export function isCardShareUrl(url, publicHosts = DEFAULT_PUBLIC_HOSTS, sensitiveQueryKeys = SENSITIVE_QUERY_KEYS) {
  if (!isPublicShareUrl(url, publicHosts, sensitiveQueryKeys)) return false
  return CARD_SHARE_HOSTS.includes(new URL(url).hostname)
}

/**
 * 该动作是否会**用到分享链**（url）。只有用到分享链的动作才受公开链闸门约束：
 * `copy.link` / `share.card.wx` / `share.card.miniapp` 恒用 url；`share.system` **有文件时用文件、不用 url**。
 */
export function actionUsesShareUrl(actionId, files) {
  if (actionId === 'share.system') return !(files && files.length > 0)
  return actionId === 'copy.link' || actionId === 'share.card.wx' || actionId === 'share.card.miniapp'
}

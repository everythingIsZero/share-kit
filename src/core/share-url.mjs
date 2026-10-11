/**
 * share-url.mjs — 公开分享链策略（S3；中性模块，零依赖）
 *
 * 单源落点：判断「这条 URL 能不能作为分享链交出去」的策略在此定义，
 * `web/execute.mjs`（执行闸门）与 `ui/mount.mjs`（列项 / 提前拦截）共用同一实现。
 * 闸门因此落在**最低公共层**——任何自组 UI（`core.listActions` + `web.executeAction`）都
 * 自动受控，不经 `mountShare` 也绕不过去。
 *
 * 本模块不碰宿主对象（只看 URL 字符串），可在 node:test 下完整覆盖。
 */

/** 敏感 query 键：出现即判非公开（私有页常带 token 之类，绝不能被复制/分享出去） */
export const SENSITIVE_QUERY_KEYS = Object.freeze(['token', 't', 'access_token'])

/** 默认公开分享域（**恒在**；`publicHosts` 只在其上追加，绝不替换） */
export const DEFAULT_PUBLIC_HOSTS = Object.freeze(['share.hxym18.com'])

/**
 * 判一个 URL 是否**公开分享链**（S3）。仅当同时满足：host 在允许域内、且不含敏感 query。
 * 私有页 / 带 token / 非允许域 / 非法 URL / 空串一律 false——分享与复制只允许公开链，
 * 页面地址（`location.href` 之类）天然不满足，从而杜绝私有页外泄。
 *
 * **允许域 = DEFAULT_PUBLIC_HOSTS ∪ publicHosts**：默认域恒在，`publicHosts` 只作**追加**
 * 的站点公开域（传 `[location.hostname]` 不会关掉默认闸门，也不会放行任意域）。
 *
 * @param url         待判 URL
 * @param publicHosts 站点声明的**追加**公开域列表
 */
export function isPublicShareUrl(url, publicHosts = DEFAULT_PUBLIC_HOSTS) {
  if (typeof url !== 'string' || url.length === 0) return false
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  const extra = Array.isArray(publicHosts) ? publicHosts.filter((h) => typeof h === 'string' && h.length > 0) : []
  const hosts = new Set([...DEFAULT_PUBLIC_HOSTS, ...extra])
  if (!hosts.has(parsed.hostname)) return false
  for (const key of parsed.searchParams.keys()) {
    if (SENSITIVE_QUERY_KEYS.includes(key.toLowerCase())) return false
  }
  return true
}

/**
 * 该动作是否会**用到分享链**（url）。只有用到分享链的动作才受公开链闸门约束：
 * `copy.link` / `share.card.wx` / `share.card.miniapp` 恒用 url；`share.system` **有文件时用文件、不用 url**。
 */
export function actionUsesShareUrl(actionId, files) {
  if (actionId === 'share.system') return !(files && files.length > 0)
  return actionId === 'copy.link' || actionId === 'share.card.wx' || actionId === 'share.card.miniapp'
}

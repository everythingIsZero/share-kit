/**
 * share-bridge-client.mjs — **服务端**短链注册客户端（单源，站点不再各写一遍）
 *
 * 为什么在这里：M2-6 只让 share-kit **认出**卡片短链（`isCardShareUrl`），但「注册短链」
 * 这件事（POST /api/shares + `x-auth-secret`、错误分类、URL 拼装、避免重复注册）此前没有封装，
 * 每个站都要自己写一遍 HTTP + 判错 + 存映射——正是「同一件事每站重包」的老毛病。
 *
 * 边界（硬约束）：
 *   - **只在服务端跑**（Node 18+ 的 `fetch`）；`secret` 绝不进浏览器/前端 bundle。
 *   - 零依赖、**永不抛错**：返回 `{ ok:true, ... } | { ok:false, outcome, status?, error? }`
 *     （与 `executeAction`/`trackEvent` 同风格——消费方在请求处理器里不该被解析异常打断）。
 *   - 不替站点决定「短链存哪」：`ensureShortLink` 收一个站点侧的 `store` 适配器（读/写一次）。
 */

import { CARD_SHARE_HOSTS } from '../core/share-url.mjs'

/** 默认中转服务地址（卡片承载域，单源在 core/share-url.mjs） */
export const DEFAULT_BRIDGE_BASE = `https://${CARD_SHARE_HOSTS[0]}`

/** 失败分类（与 auth 的 outcome 命名风格一致，站点可直接分支） */
export const BRIDGE_OUTCOMES = Object.freeze({
  UNAUTHORIZED: 'unauthorized', // 401：secret 错/缺
  INVALID: 'invalid', // 400：字段非法（targetUrl/thumbUrl 非白名单等）
  RATE_LIMITED: 'rate_limited', // 429
  UNAVAILABLE: 'unavailable', // 503 / 5xx / bridge 侧错误
  NETWORK: 'network', // 连不上/超时
  BAD_RESPONSE: 'bad_response', // 200 但体形态不符（拿了也拼不出短链）
  STORE_FAILED: 'store_failed', // 站点侧 store 读写抛错（客户端因此永不抛错）
})

/**
 * 造一个短链注册客户端。
 *
 * @param {{
 *   secret: string | (() => string),   // `x-auth-secret`（**只服务端**；给函数则每次请求现读 env）
 *   owner: string,                     // 归属标识（bridge 落库用，≤128）
 *   baseUrl?: string,                  // 默认 DEFAULT_BRIDGE_BASE
 *   fetchImpl?: typeof fetch,          // 测试/自定义运行时注入
 *   timeoutMs?: number,                // 默认 5000
 * }} opts
 */
export function createShareBridgeClient(opts) {
  const o = opts || {}
  const baseUrl = String(o.baseUrl || DEFAULT_BRIDGE_BASE).replace(/\/+$/, '')
  const owner = o.owner
  if (typeof owner !== 'string' || owner.trim() === '') {
    throw new TypeError('createShareBridgeClient: owner 必填（bridge 落库的归属标识）')
  }
  if (typeof o.secret !== 'string' && typeof o.secret !== 'function') {
    throw new TypeError('createShareBridgeClient: secret 必填（字符串或 () => string；只在服务端持有）')
  }
  const secretOf = () => (typeof o.secret === 'function' ? o.secret() : o.secret)
  // 显式传了非函数（如 null/'auto'）→ 装配期报错，不静默回退（配置错要看得见）
  const fetchImpl = o.fetchImpl === undefined ? globalThis.fetch : o.fetchImpl
  if (typeof fetchImpl !== 'function') {
    throw new TypeError('createShareBridgeClient: fetchImpl 必须是函数（省略则用运行时 fetch）')
  }
  const timeoutMs = Number.isFinite(o.timeoutMs) && o.timeoutMs > 0 ? o.timeoutMs : 5000

  /** 短链形态（与 bridge 的 `/s/:id` 路由一致；改路由只改这里） */
  const shortUrlFor = (shareId) => `${baseUrl}/s/${encodeURIComponent(String(shareId))}`

  /** 注册一条分享，返回 `{ ok:true, shareId, shortUrl }`。**注意：bridge 当前无幂等键**——重复调用会得到不同短链，需固定映射请用 `ensureShortLink`。 */
  async function register(input) {
    const i = input || {}
    const secret = secretOf()
    if (typeof secret !== 'string' || secret === '') {
      return { ok: false, outcome: BRIDGE_OUTCOMES.UNAUTHORIZED, error: '缺少 AUTH_INTERNAL_SECRET（服务端未配）' }
    }
    if (typeof i.targetUrl !== 'string' || i.targetUrl === '') {
      return { ok: false, outcome: BRIDGE_OUTCOMES.INVALID, error: 'targetUrl 必填' }
    }
    const body = { targetUrl: i.targetUrl, card: i.card || {}, owner }
    let res
    try {
      res = await fetchImpl(`${baseUrl}/api/shares`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-auth-secret': secret },
        body: JSON.stringify(body),
        signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined,
      })
    } catch (err) {
      return { ok: false, outcome: BRIDGE_OUTCOMES.NETWORK, error: String((err && err.message) || err) }
    }
    const status = Number(res && res.status)
    if (status === 401) return { ok: false, outcome: BRIDGE_OUTCOMES.UNAUTHORIZED, status }
    if (status === 400) return { ok: false, outcome: BRIDGE_OUTCOMES.INVALID, status }
    if (status === 429) return { ok: false, outcome: BRIDGE_OUTCOMES.RATE_LIMITED, status }
    if (!Number.isFinite(status) || status < 200 || status >= 300) {
      return { ok: false, outcome: BRIDGE_OUTCOMES.UNAVAILABLE, status }
    }
    let data
    try {
      data = await res.json()
    } catch {
      return { ok: false, outcome: BRIDGE_OUTCOMES.BAD_RESPONSE, status, error: '响应不是 JSON' }
    }
    const shareId = data && typeof data.shareId === 'string' ? data.shareId : ''
    if (data && data.ok !== true) return { ok: false, outcome: BRIDGE_OUTCOMES.UNAVAILABLE, status }
    if (!shareId) return { ok: false, outcome: BRIDGE_OUTCOMES.BAD_RESPONSE, status, error: '响应缺 shareId' }
    return { ok: true, shareId, shortUrl: shortUrlFor(shareId), status }
  }

  /**
   * 取该分享的短链：**有缓存就用缓存**，没有才注册并写回。
   *
   * `store` 是站点侧的持久化适配器（各站的表/列不同，故做成注入而不是内置）：
   *   `{ get(key): Promise<string|null>|string|null, set(key, shortUrl): Promise<void>|void }`
   * key 由站点给（通常是它自己的 share id / token），保证**同一分享只有一条短链**。
   *
   * 失败（bridge 不可达/未配密钥）返回 `{ ok:false, ... }`，**不写 store**——站点可降级为站内链。
   *
   * @param {{ key: string, targetUrl: string, card?: object, store: { get: Function, set: Function } }} input
   */
  async function ensureShortLink(input) {
    const i = input || {}
    if (typeof i.key !== 'string' || i.key === '') {
      return { ok: false, outcome: BRIDGE_OUTCOMES.INVALID, error: 'ensureShortLink: key 必填（站点侧分享标识）' }
    }
    const store = i.store
    if (!store || typeof store.get !== 'function' || typeof store.set !== 'function') {
      return { ok: false, outcome: BRIDGE_OUTCOMES.INVALID, error: 'ensureShortLink: store 需要 { get, set }' }
    }
    let cached
    try {
      cached = await store.get(i.key)
    } catch (err) {
      return { ok: false, outcome: BRIDGE_OUTCOMES.STORE_FAILED, error: `store.get 失败：${String((err && err.message) || err)}` }
    }
    if (typeof cached === 'string' && cached) return { ok: true, shortUrl: cached, cached: true }
    const created = await register({ targetUrl: i.targetUrl, card: i.card })
    if (!created.ok) return created
    try {
      await store.set(i.key, created.shortUrl)
    } catch (err) {
      // 短链已注册但没存下来：如实报错（站点下次会再注册一条，属站点可接受的重复；bridge 缺幂等键见 README）
      return { ok: false, outcome: BRIDGE_OUTCOMES.STORE_FAILED, error: `store.set 失败：${String((err && err.message) || err)}`, shortUrl: created.shortUrl }
    }
    return { ...created, cached: false }
  }

  return { register, ensureShortLink, shortUrlFor, baseUrl, owner }
}

/**
 * share-bridge-client.test.mjs — 服务端短链注册客户端（`@hxym18/share-kit/node`）
 *
 * 覆盖：构造校验、请求形态（path/header/body）、错误分类、URL 拼装、
 * `ensureShortLink` 的缓存语义（命中不重复注册、失败不写 store）、`store` 抛错不炸客户端。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createShareBridgeClient, DEFAULT_BRIDGE_BASE, BRIDGE_OUTCOMES } from '../../src/node/index.mjs'

/** 假 fetch：按脚本返回，并记录每次调用 */
function fakeFetch(handler) {
  const calls = []
  const fn = async (url, init) => {
    calls.push({ url: String(url), init })
    return handler(String(url), init)
  }
  fn.calls = calls
  return fn
}
const json = (status, data) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })

const OPTS = { secret: 's3cret', owner: 'fang' }

test('构造校验：owner / secret / fetch 缺失即抛（装配期 fail-closed）', () => {
  assert.throws(() => createShareBridgeClient({ secret: 'x', owner: '' }), /owner/)
  assert.throws(() => createShareBridgeClient({ owner: 'fang' }), /secret/)
  assert.throws(() => createShareBridgeClient({ secret: 'x', owner: 'fang', fetchImpl: null }), /fetch/)
})

test('默认 base 来自卡片承载域单源；自定义 baseUrl 去尾斜杠', () => {
  assert.equal(DEFAULT_BRIDGE_BASE, 'https://share.hxym18.com')
  const c = createShareBridgeClient({ ...OPTS, baseUrl: 'https://share.hxym18.com/' })
  assert.equal(c.baseUrl, 'https://share.hxym18.com')
  assert.equal(c.shortUrlFor('Ab12'), 'https://share.hxym18.com/s/Ab12')
  assert.equal(c.owner, 'fang')
})

test('register：请求形态正确（POST /api/shares + x-auth-secret + 白名单字段），返回短链', async () => {
  const f = fakeFetch(() => json(201, { ok: true, shareId: 'Ab12Cd' }))
  const c = createShareBridgeClient({ ...OPTS, fetchImpl: f })
  const r = await c.register({ targetUrl: 'https://fang.hxym18.com/s/t1', card: { title: 'T', desc: 'D' } })
  assert.deepEqual(r, { ok: true, shareId: 'Ab12Cd', shortUrl: 'https://share.hxym18.com/s/Ab12Cd', status: 201 })
  const call = f.calls[0]
  assert.equal(call.url, 'https://share.hxym18.com/api/shares')
  assert.equal(call.init.method, 'POST')
  assert.equal(call.init.headers['x-auth-secret'], 's3cret')
  assert.deepEqual(JSON.parse(call.init.body), {
    targetUrl: 'https://fang.hxym18.com/s/t1',
    card: { title: 'T', desc: 'D' },
    owner: 'fang',
  })
})

test('register：secret 传函数则每次请求现读 env；空 → unauthorized 且不发请求', async () => {
  let v = 'k1'
  const f = fakeFetch(() => json(201, { ok: true, shareId: 'A1' }))
  const c = createShareBridgeClient({ owner: 'fang', secret: () => v, fetchImpl: f })
  await c.register({ targetUrl: 'https://fang.hxym18.com/s/t1' })
  v = ''
  const miss = await c.register({ targetUrl: 'https://fang.hxym18.com/s/t1' })
  assert.equal(miss.ok, false)
  assert.equal(miss.outcome, BRIDGE_OUTCOMES.UNAUTHORIZED)
  assert.equal(f.calls.length, 1, '空密钥不得再发请求')
})

test('register：错误分类（401/400/429/5xx/网络/非 JSON/缺 shareId/ok:false）', async () => {
  const cases = [
    [() => json(401, { ok: false }), BRIDGE_OUTCOMES.UNAUTHORIZED],
    [() => json(400, { ok: false }), BRIDGE_OUTCOMES.INVALID],
    [() => json(429, { ok: false }), BRIDGE_OUTCOMES.RATE_LIMITED],
    [() => json(502, { ok: false }), BRIDGE_OUTCOMES.UNAVAILABLE],
    [() => new Response('not json', { status: 201 }), BRIDGE_OUTCOMES.BAD_RESPONSE],
    [() => json(201, { ok: true }), BRIDGE_OUTCOMES.BAD_RESPONSE],
    [() => json(200, { ok: false }), BRIDGE_OUTCOMES.UNAVAILABLE],
    [() => { throw new Error('ECONNREFUSED') }, BRIDGE_OUTCOMES.NETWORK],
  ]
  for (const [handler, outcome] of cases) {
    const c = createShareBridgeClient({ ...OPTS, fetchImpl: fakeFetch(handler) })
    const r = await c.register({ targetUrl: 'https://fang.hxym18.com/s/t1' })
    assert.equal(r.ok, false, `${outcome} 应失败`)
    assert.equal(r.outcome, outcome, `期望 ${outcome}，实为 ${r.outcome}`)
  }
})

test('register：targetUrl 缺失 → invalid，不发请求', async () => {
  const f = fakeFetch(() => json(201, { ok: true, shareId: 'A1' }))
  const c = createShareBridgeClient({ ...OPTS, fetchImpl: f })
  const r = await c.register({ targetUrl: '' })
  assert.equal(r.outcome, BRIDGE_OUTCOMES.INVALID)
  assert.equal(f.calls.length, 0)
})

test('ensureShortLink：命中缓存不注册；未命中注册并写回；失败不写 store', async () => {
  const store = new Map()
  const f = fakeFetch(() => json(201, { ok: true, shareId: 'Xy9' }))
  const c = createShareBridgeClient({ ...OPTS, fetchImpl: f })
  const adapters = {
    get: (k) => store.get(k) ?? null,
    set: (k, v) => void store.set(k, v),
  }
  const first = await c.ensureShortLink({ key: 'share-1', targetUrl: 'https://fang.hxym18.com/s/t1', store: adapters })
  assert.equal(first.ok, true)
  assert.equal(first.cached, false)
  assert.equal(store.get('share-1'), 'https://share.hxym18.com/s/Xy9')
  const second = await c.ensureShortLink({ key: 'share-1', targetUrl: 'https://fang.hxym18.com/s/t1', store: adapters })
  assert.equal(second.cached, true)
  assert.equal(f.calls.length, 1, '缓存命中不得重复注册（bridge 无幂等键，重复调用会产生不同短链）')

  const f2 = fakeFetch(() => json(503, {}))
  const store2 = new Map()
  const c2 = createShareBridgeClient({ ...OPTS, fetchImpl: f2 })
  const fail = await c2.ensureShortLink({
    key: 'share-2',
    targetUrl: 'https://fang.hxym18.com/s/t2',
    store: { get: (k) => store2.get(k) ?? null, set: (k, v) => void store2.set(k, v) },
  })
  assert.equal(fail.ok, false)
  assert.equal(fail.outcome, BRIDGE_OUTCOMES.UNAVAILABLE)
  assert.equal(store2.size, 0, '注册失败不得写 store（否则会把坏值缓存住）')
})

test('ensureShortLink：key/store 缺失 → invalid；store 抛错 → store_failed（客户端永不抛）', async () => {
  const c = createShareBridgeClient({ ...OPTS, fetchImpl: fakeFetch(() => json(201, { ok: true, shareId: 'A1' })) })
  assert.equal((await c.ensureShortLink({ targetUrl: 'x', store: { get() {}, set() {} } })).outcome, BRIDGE_OUTCOMES.INVALID)
  assert.equal((await c.ensureShortLink({ key: 'k', targetUrl: 'x' })).outcome, BRIDGE_OUTCOMES.INVALID)

  const boom = createShareBridgeClient({ ...OPTS, fetchImpl: fakeFetch(() => json(201, { ok: true, shareId: 'A1' })) })
  const r = await boom.ensureShortLink({
    key: 'k',
    targetUrl: 'x',
    store: {
      get() {
        throw new Error('db down')
      },
      set() {},
    },
  })
  assert.equal(r.ok, false)
  assert.equal(r.outcome, BRIDGE_OUTCOMES.STORE_FAILED)
  assert.match(r.error, /db down/)
})

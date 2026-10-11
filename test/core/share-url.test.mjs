/**
 * share-url.test.mjs — 公开分享链 / 带卡片短链判定（S3、M2-6）
 *
 * 单源落点是 `src/core/share-url.mjs`（零依赖）：公开链闸门与「卡片承载域」判定都在这里，
 * `web/execute.mjs` / `ui/mount.mjs` / `core/decide.mjs` 共用，不在别处复制逻辑。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  CARD_SHARE_HOSTS,
  DEFAULT_PUBLIC_HOSTS,
  isCardShareUrl,
  isPublicShareUrl,
} from '../../src/core/share-url.mjs'

test('isCardShareUrl：卡片承载域 + 合法公开链才 true', () => {
  // 站点服务端注册短链后拿到的公开短链：https://share.hxym18.com/s/<shareId>
  assert.equal(isCardShareUrl('https://share.hxym18.com/s/abc123'), true)
  // 敏感 query → 先被公开链闸门判非公开 → 不是可交出去的卡片短链
  assert.equal(isCardShareUrl('https://share.hxym18.com/s/abc123?token=x'), false)
  assert.equal(isCardShareUrl('https://share.hxym18.com/s/abc123?access_token=x'), false)
  // 私有域 / 站点追加的普通公开域：都不是卡片承载域
  assert.equal(isCardShareUrl('https://fang.hxym18.com/ledger'), false)
  assert.equal(isCardShareUrl('https://cdn.example.com/s/1', ['cdn.example.com']), false)
  // 空 / 非法
  assert.equal(isCardShareUrl(''), false)
  assert.equal(isCardShareUrl(undefined), false)
  assert.equal(isCardShareUrl('not a url'), false)
})

test('卡片承载域是 share-url.mjs 的单源常量，且本身也是公开链（卡片短链先要公开）', () => {
  assert.deepEqual([...CARD_SHARE_HOSTS], ['share.hxym18.com'])
  for (const host of CARD_SHARE_HOSTS) {
    assert.ok(DEFAULT_PUBLIC_HOSTS.includes(host), `${host} 应在默认公开域内——卡片短链本身也是公开链`)
  }
})

test('isCardShareUrl 不放松公开链闸门：卡片域带敏感 query 也 false', () => {
  assert.equal(isPublicShareUrl('https://share.hxym18.com/s/1?access_token=a'), false)
  assert.equal(isCardShareUrl('https://share.hxym18.com/s/1?access_token=a'), false)
})

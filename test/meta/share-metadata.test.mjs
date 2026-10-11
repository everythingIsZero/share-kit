/**
 * share-metadata.test.mjs — 分享卡片元信息工厂（默认 + 覆盖）
 *
 * 覆盖：默认值（1200×630 / noindex / zh_CN / twitter card）、绝对化、版本化、
 * 覆盖生效、必填校验（origin/image/path/title）、无 undefined 键、可 JSON 序列化、长度体检。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createShareMetadata,
  describeLength,
  OG_IMAGE_WIDTH,
  OG_IMAGE_HEIGHT,
  OG_TITLE_MAX,
} from '../../src/meta/index.mjs'

const SITE = createShareMetadata({
  origin: 'https://fang.hxym18.com',
  siteName: '房屋出租账本',
  image: '/og/share-v1.png',
  imageVersion: 'v1',
})

test('默认值：1200×630、noindex、zh_CN、summary_large_image、og:url 绝对化', () => {
  const m = SITE({ path: '/s/tok1', title: '3 套空房', description: '房东分享' })
  assert.equal(m.openGraph.images[0].url, 'https://fang.hxym18.com/og/share-v1.png?v=v1')
  assert.equal(m.openGraph.images[0].width, OG_IMAGE_WIDTH)
  assert.equal(m.openGraph.images[0].height, OG_IMAGE_HEIGHT)
  assert.equal(m.openGraph.url, 'https://fang.hxym18.com/s/tok1')
  assert.equal(m.openGraph.siteName, '房屋出租账本')
  assert.equal(m.openGraph.locale, 'zh_CN')
  assert.deepEqual(m.robots, { index: false, follow: false })
  assert.equal(m.twitter.card, 'summary_large_image')
  assert.equal(m.twitter.images[0], 'https://fang.hxym18.com/og/share-v1.png?v=v1')
})

test('传参覆盖：图/图版本/noindex/type/siteName/绝对图片 URL', () => {
  const m = SITE({
    path: '/s/tok1',
    title: 'T',
    image: '/og/room-v9.png',
    imageVersion: 'v9',
    noindex: false,
    type: 'article',
    siteName: '其它名',
  })
  assert.equal(m.openGraph.images[0].url, 'https://fang.hxym18.com/og/room-v9.png?v=v9')
  assert.equal(m.openGraph.type, 'article')
  assert.equal(m.openGraph.siteName, '其它名')
  assert.deepEqual(m.robots, { index: true, follow: true })

  const abs = SITE({ path: 'https://cdn.example.com/p/1', title: 'T', image: 'https://cdn.example.com/i.png' })
  assert.equal(abs.openGraph.url, 'https://cdn.example.com/p/1')
  assert.equal(abs.openGraph.images[0].url, 'https://cdn.example.com/i.png?v=v1')
})

test('无 description 时不产出该键；对象无 undefined、可 JSON 序列化', () => {
  const m = SITE({ path: '/s/t', title: 'T' })
  assert.equal('description' in m, false)
  assert.equal('description' in m.openGraph, false)
  assert.equal(JSON.stringify(m).includes('undefined'), false)
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(m)))

  const noSiteName = createShareMetadata({ origin: 'https://x.hxym18.com', image: '/i.png' })({ path: '/p', title: 'T' })
  assert.equal('siteName' in noSiteName.openGraph, false, '未给 siteName 不得产出 undefined 键')
})

test('装配期与调用期校验：origin/image/path/title 必填即抛（fail-fast，别静默出坏卡片）', () => {
  assert.throws(() => createShareMetadata({ image: '/i.png' }), /origin/)
  assert.throws(() => createShareMetadata({ origin: 'fang.hxym18.com', image: '/i.png' }), /origin/)
  assert.throws(() => createShareMetadata({ origin: 'https://x.hxym18.com' }), /image/)
  const f = createShareMetadata({ origin: 'https://x.hxym18.com', image: '/i.png' })
  assert.throws(() => f({ title: 'T' }), /path/)
  assert.throws(() => f({ path: '/p' }), /title/)
})

test('长度体检：报告超限但不截断（抓取器自行截断，静默截断会骗人）', () => {
  const long = 'x'.repeat(OG_TITLE_MAX + 1)
  const r = describeLength(long)
  assert.equal(r.length, OG_TITLE_MAX + 1)
  assert.equal(r.titleTooLong, true)
  assert.equal(describeLength('短').titleTooLong, false)
  const m = SITE({ path: '/p', title: long })
  assert.equal(m.title, long, '不得截断')
})

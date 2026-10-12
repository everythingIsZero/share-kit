/**
 * default-deps.test.mjs — 浏览器默认 deps（SH-1）
 *
 * 下沉自 fang/zitie/nuantie 各写一遍的 `systemShare` / `triggerDownload`：
 * 本包给默认实现，消费方 `executeAction(id, { share: systemShare, download: triggerDownload, copy: defaultCopy, ... })`
 * 即可，不必逐站手写。判定作用：
 *   - 有 files 只传文件、无 files 才用 url（防 iOS 面板把链接当主体）；
 *   - 下载走 `a[download]`，空源**不造空 anchor**（空 href 会被解析成当前文档 URL）；
 *   - 复制优先剪贴板、失败落 execCommand，空文本静默返回（绝不复制字面量 "undefined"）。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

// ---------------------------------------------------------------------------
// 最小宿主桩
// ---------------------------------------------------------------------------

const created = []
const clicked = []
const textareas = []
let clipboardText = null
let execCopied = null

const docStub = {
  body: {
    appendChild() {},
    removeChild() {},
  },
  createElement(tag) {
    const el = {
      tagName: String(tag).toUpperCase(),
      style: {},
      href: '',
      download: '',
      value: '',
      _listeners: {},
      setAttribute() {},
      addEventListener(type, fn) {
        ;(el._listeners[type] ||= []).push(fn)
      },
      select() {},
      click() {
        clicked.push(el)
        ;(el._listeners.click || []).forEach((fn) => fn({ target: el }))
      },
      remove() {},
    }
    if (tag === 'textarea') textareas.push(el)
    created.push(el)
    return el
  },
  execCommand() {
    execCopied = textareas.length ? textareas[textareas.length - 1].value : null
  },
}

Object.defineProperty(globalThis, 'document', { value: docStub, configurable: true, writable: true })

const setNavigator = (value) =>
  Object.defineProperty(globalThis, 'navigator', { value, configurable: true, writable: true })

setNavigator({})

const { systemShare, triggerDownload, defaultCopy } = await import('../../src/web/default-deps.mjs')

// ---------------------------------------------------------------------------
// systemShare（dep: share）
// ---------------------------------------------------------------------------

test('systemShare：有 files 只传文件不带 url（防 iOS 面板把链接当主体）', () => {
  let seen = null
  setNavigator({ share: (d) => { seen = d; return Promise.resolve() } })
  const file = { name: 'poster.png' }
  systemShare({ files: [file], url: 'https://share.hxym18.com/s/1', title: 't', text: 'x' })
  assert.equal(seen.url, undefined, '有 files 时不得混入 url')
  assert.deepEqual(seen.files, [file])
  assert.equal(seen.title, 't')
  assert.equal(seen.text, 'x')
})

test('systemShare：无 files 用 url', () => {
  let seen = null
  setNavigator({ share: (d) => { seen = d; return Promise.resolve() } })
  systemShare({ url: 'https://share.hxym18.com/s/1' })
  assert.equal(seen.url, 'https://share.hxym18.com/s/1')
  assert.equal(seen.files, undefined)
})

test('systemShare：files 为空数组时按「无文件」处理，回退 url', () => {
  let seen = null
  setNavigator({ share: (d) => { seen = d; return Promise.resolve() } })
  systemShare({ files: [], url: 'https://share.hxym18.com/s/1' })
  assert.equal(seen.url, 'https://share.hxym18.com/s/1')
  assert.equal(seen.files, undefined)
})

test('systemShare：navigator.share 缺席时抛错（由 executeAction 归为失败，不静默）', () => {
  setNavigator({})
  assert.throws(() => systemShare({ url: 'https://share.hxym18.com/s/1' }), /navigator\.share unavailable/)
})

// ---------------------------------------------------------------------------
// triggerDownload（dep: download）
// ---------------------------------------------------------------------------

test('triggerDownload：对象入参 { url, filename } 造 a[download] 并点击后移除', () => {
  created.length = 0
  clicked.length = 0
  triggerDownload({ url: 'blob:poster', filename: 'p.png' })
  const a = created.find((el) => el.tagName === 'A')
  assert.ok(a, '应创建 anchor')
  assert.equal(a.href, 'blob:poster')
  assert.equal(a.download, 'p.png')
  assert.equal(clicked.includes(a), true, '应触发点击')
})

test('triggerDownload：位置式 (url, filename) 同样可用（站点既有调用形态）', () => {
  created.length = 0
  clicked.length = 0
  triggerDownload('data:image/png;base64,AAA', 'q.png')
  const a = created.find((el) => el.tagName === 'A')
  assert.ok(a)
  assert.equal(a.href, 'data:image/png;base64,AAA')
  assert.equal(a.download, 'q.png')
})

test('triggerDownload：空源不造空 anchor（空 href 会被浏览器解析成当前文档 URL）', () => {
  created.length = 0
  clicked.length = 0
  triggerDownload({})
  triggerDownload('')
  triggerDownload(undefined)
  assert.equal(created.length, 0, '空源不得创建 anchor')
  assert.equal(clicked.length, 0, '空源不得触发点击')
})

// ---------------------------------------------------------------------------
// defaultCopy（dep: copy）
// ---------------------------------------------------------------------------

test('defaultCopy：优先用剪贴板', async () => {
  clipboardText = null
  execCopied = null
  textareas.length = 0
  setNavigator({ clipboard: { writeText: async (t) => { clipboardText = t } } })
  await defaultCopy('https://share.hxym18.com/s/1')
  assert.equal(clipboardText, 'https://share.hxym18.com/s/1')
  assert.equal(execCopied, null, '剪贴板成功时不应落 execCommand')
})

test('defaultCopy：剪贴板失败落 execCommand 兜底', async () => {
  clipboardText = null
  execCopied = null
  textareas.length = 0
  setNavigator({ clipboard: { writeText: async () => { throw new Error('denied') } } })
  await defaultCopy('https://share.hxym18.com/s/2')
  assert.equal(execCopied, 'https://share.hxym18.com/s/2', '剪贴板失败应落 textarea + execCommand')
})

test('defaultCopy：空文本静默返回，不复制字面量 "undefined"', async () => {
  clipboardText = null
  execCopied = null
  textareas.length = 0
  setNavigator({ clipboard: { writeText: async (t) => { clipboardText = t } } })
  await defaultCopy('')
  await defaultCopy(undefined)
  assert.equal(clipboardText, null, '空文本不得调用剪贴板')
  assert.equal(execCopied, null, '空文本不得落 execCommand')
})

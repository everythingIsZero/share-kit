/**
 * mount.test.mjs — mountShare 编排层（S3 分享链 / 文件源分离）
 *
 * 不引入 jsdom：编排层这条路径只需「挂载 → 点击 → 执行」，用最小 DOM 桩即可，
 * 且能精确观测 executeAction 实际拿到的 deps（这正是 S3 要修的地方）：
 *   - `deps.url` 只作公开分享链，**不再 `|| location.href`**；
 *   - `save.album` 下载走文件源（`files[0]` → `fileUrl`），**不下载页面 HTML**。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

// ---------------------------------------------------------------------------
// 最小 DOM 桩（只覆盖 mountShare 走到的 API）
// ---------------------------------------------------------------------------

function makeEl(tag) {
  const el = {
    tagName: String(tag).toUpperCase(),
    children: [],
    dataset: {},
    style: {},
    _attrs: {},
    _listeners: {},
    classList: {
      _s: new Set(),
      add(...c) {
        c.forEach((x) => this._s.add(x))
      },
      remove(...c) {
        c.forEach((x) => this._s.delete(x))
      },
      contains(c) {
        return this._s.has(c)
      },
    },
    textContent: '',
    className: '',
    value: '',
    // 让 collectSignals 的 detectDownloadAttr（`'download' in a`）探得 true
    download: '',
    id: '',
    href: '',
    src: '',
    type: '',
    alt: '',
    setAttribute(k, v) {
      this._attrs[k] = v
    },
    getAttribute(k) {
      return this._attrs[k]
    },
    appendChild(c) {
      this.children.push(c)
      c.parentNode = this
      return c
    },
    removeChild(c) {
      this.children = this.children.filter((x) => x !== c)
      return c
    },
    addEventListener(type, fn) {
      ;(this._listeners[type] ||= []).push(fn)
    },
    removeEventListener(type, fn) {
      this._listeners[type] = (this._listeners[type] || []).filter((f) => f !== fn)
    },
    remove() {
      if (this.parentNode) this.parentNode.removeChild(this)
    },
    select() {},
    click() {
      fire(this, 'click')
    },
  }
  return el
}

function fire(el, type) {
  for (const fn of el._listeners[type] || []) fn({ target: el, key: undefined, type })
}

/** 在 DOM 树里找带 data-action 的按钮 */
function findAction(root, id) {
  if (root.dataset && root.dataset.action === id) return root
  for (const c of root.children) {
    const hit = findAction(c, id)
    if (hit) return hit
  }
  return null
}

const PAGE_URL = 'https://page/private?token=secret'

let copied = null
const textareas = []
const downloaded = []

const documentStub = {
  head: makeEl('head'),
  body: makeEl('body'),
  createElement(tag) {
    const el = makeEl(tag)
    if (tag === 'textarea') textareas.push(el)
    // defaultDownload 走 a.click()：点击时记录 href，验证下载源
    if (tag === 'a') el.addEventListener('click', () => downloaded.push(el.href))
    return el
  },
  getElementById(id) {
    return this.head.children.find((c) => c.id === id) || null
  },
  addEventListener() {},
  removeEventListener() {},
  execCommand() {
    copied = textareas.length ? textareas[textareas.length - 1].value : null
  },
}

// mountShare 在调用期读全局；此处先装桩（navigator 在 Node 是只读 getter，须 defineProperty）
Object.defineProperty(globalThis, 'navigator', {
  value: { userAgent: '', maxTouchPoints: 0 },
  configurable: true,
  writable: true,
})
Object.defineProperty(globalThis, 'location', { value: { href: PAGE_URL }, configurable: true, writable: true })
globalThis.document = documentStub
globalThis.requestAnimationFrame = (cb) => cb()

const { mountShare } = await import('../../src/ui/mount.mjs')

const tick = () => new Promise((r) => setTimeout(r, 0))

test('mount：deps.url 只取 artifact.url（有 url 时复制到的是分享链）', async () => {
  copied = null
  const target = makeEl('div')
  const handle = mountShare(target, { artifact: { kind: 'link', url: 'https://share.hxym18.com/s/app/1' } })
  fire(target.children[0], 'click') // 触发按钮
  await tick()
  assert.equal(copied, 'https://share.hxym18.com/s/app/1')
  handle.unmount()
})

test('mount：artifact 无 url 时不回退 location.href（S3 移除回退）', async () => {
  copied = null
  const target = makeEl('div')
  const handle = mountShare(target, { artifact: { kind: 'link' } })
  fire(target.children[0], 'click')
  await tick()
  assert.notEqual(copied, PAGE_URL, '缺 url 不得拿 location.href 顶替')
  handle.unmount()
})

test('mount：save.album 下载走文件源 fileUrl，不下载页面 HTML', async () => {
  downloaded.length = 0
  const target = makeEl('div')
  const handle = mountShare(target, {
    artifact: { kind: 'video', url: PAGE_URL, fileUrl: 'blob:file', filename: 'v.mp4' },
  })
  fire(target.children[0], 'click') // video 无图 → 弹 Action Sheet
  const item = findAction(documentStub.body, 'save.album')
  assert.ok(item, 'sheet 里应有 save.album 项')
  fire(item, 'click')
  await tick()
  assert.equal(downloaded[0], 'blob:file', '下载源应是文件 fileUrl')
  assert.notEqual(downloaded[0], PAGE_URL, '不得下载页面 HTML')
  handle.unmount()
})

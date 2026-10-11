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

const { mountShare, GUIDANCE_COPY_ID } = await import('../../src/ui/mount.mjs')
const { renderCopy } = await import('../../src/core/index.mjs')

const tick = () => new Promise((r) => setTimeout(r, 0))
const setUA = (ua) => {
  globalThis.navigator.userAgent = ua
}

/** 按 class 找元素（找 tip 条） */
function findClass(root, cls) {
  if (typeof root.className === 'string' && root.className.split(/\s+/).includes(cls)) return root
  for (const c of root.children) {
    const hit = findClass(c, cls)
    if (hit) return hit
  }
  return null
}

test('mount：deps.url 只取 artifact.url（有 url 时复制到的是分享链）', async () => {
  setUA('')
  copied = null
  const target = makeEl('div')
  const handle = mountShare(target, { artifact: { kind: 'link', url: 'https://share.hxym18.com/s/app/1' } })
  fire(target.children[0], 'click') // 触发按钮
  await tick()
  assert.equal(copied, 'https://share.hxym18.com/s/app/1')
  handle.unmount()
})

test('mount：artifact 无 url 时不复制任何东西（不回退 location.href，也不复制字面量 "undefined"）', async () => {
  setUA('')
  copied = null
  const target = makeEl('div')
  const handle = mountShare(target, { artifact: { kind: 'link' } })
  fire(target.children[0], 'click')
  await tick()
  // 真判定：无公开链时 defaultCopy 应静默返回，execCommand/剪贴板**未被调用**（copied 保持 null）。
  // 若回归到 `artifact.url || location.href`（复制页面地址）或裸传 undefined（复制 "undefined"），
  // copied 会被写成 PAGE_URL / undefined，"=== null" 即失败。
  assert.equal(copied, null, '无 url 时不得触发复制（回退 location.href 或复制 undefined 都会让本断言变红）')
  handle.unmount()
})

test('mount：save.album 下载走文件源 fileUrl，不下载页面 HTML', async () => {
  setUA('')
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

test('mount：deps 为 getter——挂载后补 url 能取到最新值（执行时取值）', async () => {
  setUA('') // 未知环境 link 只剩 copy.link 单一动作，点击直接执行
  copied = null
  const target = makeEl('div')
  const artifact = { kind: 'link' } // 挂载时无 url
  const handle = mountShare(target, { artifact })
  artifact.url = 'https://share.hxym18.com/s/app/late' // 挂载后补
  fire(target.children[0], 'click')
  await tick()
  assert.equal(copied, 'https://share.hxym18.com/s/app/late', 'getter 应在执行时取到补上的 url')
  handle.unmount()
})

test('mount：引导类动作不报「已完成」，按钮显示对应引导文案', async () => {
  // 微信内 link → share.card.wx（引导类）：点按钮不弹分享面板，给一步引导
  setUA('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.0')
  const target = makeEl('div')
  const handle = mountShare(target, { artifact: { kind: 'link', url: 'https://share.hxym18.com/s/app/1' } })
  fire(target.children[0], 'click') // 打开 Action Sheet
  const item = findAction(documentStub.body, 'share.card.wx')
  assert.ok(item, '微信内 link 的 sheet 里应有 share.card.wx')
  fire(item, 'click')
  await tick()
  const expected = renderCopy('card-wx-link')
  assert.equal(target.children[0].textContent, expected, '按钮应显示引导文案')
  assert.notEqual(target.children[0].textContent, '已完成 · 可再试一次', '引导类不得报「已完成」')
  const tip = findClass(documentStub.body, 'share-kit-tip')
  assert.ok(tip, '引导类应弹 tip')
  assert.equal(tip.textContent, expected, 'tip 文案与动作对应')
  handle.unmount()
})

test('tip 按动作选文案：wx / miniapp 各用各自 copy，不恒用 card-wx-link', () => {
  assert.equal(GUIDANCE_COPY_ID['share.card.wx'], 'card-wx-link')
  assert.equal(GUIDANCE_COPY_ID['share.card.miniapp'], 'card-miniapp-link')
  assert.notEqual(GUIDANCE_COPY_ID['share.card.miniapp'], GUIDANCE_COPY_ID['share.card.wx'])
  // 映射指向的 core 文案必须都存在且非空
  for (const id of Object.values(GUIDANCE_COPY_ID)) {
    assert.ok(renderCopy(id).length > 0, `${id} 必须有正文`)
  }
})

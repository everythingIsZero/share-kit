/**
 * mount.test.mjs — mountShare 编排层（S3 分享链 / 文件源分离）
 *
 * 不引入 jsdom：编排层这条路径只需「挂载 → 点击 → 执行」，用最小 DOM 桩即可，
 * 且能精确观测 executeAction 实际拿到的 deps（这正是 S3 要修的地方）：
 *   - `deps.url` 只作公开分享链，**不再 `|| location.href`**；
 *   - `save.download` 下载走文件源（`files[0]` → `fileUrl`），**不下载页面 HTML**。
 */

import { test, beforeEach } from 'node:test'
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
let execOk = true
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
    return execOk
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

const { mountShare, GUIDANCE_COPY_ID, isPublicShareUrl, actionUsesShareUrl } = await import('../../src/ui/mount.mjs')
const { renderCopy } = await import('../../src/core/index.mjs')

const tick = () => new Promise((r) => setTimeout(r, 0))

// 每个用例前清空 body（浮层/tip 的 setTimeout 移除在测试里不会触发，避免跨用例串台）
beforeEach(() => {
  documentStub.body.children = []
  copied = null
  execOk = true
  downloaded.length = 0
})

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

/** 按 class 收集全部匹配元素（保持 DOM 顺序，用于断言「首个按钮 = 主推荐」） */
function collectByClass(root, cls, out = []) {
  if (typeof root.className === 'string' && root.className.split(/\s+/).includes(cls)) out.push(root)
  for (const c of root.children) collectByClass(c, cls, out)
  return out
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

test('mount：save.download 下载走文件源 fileUrl，不下载页面 HTML', async () => {
  setUA('') // 未知环境 video + 探得 a[download] → 信号兜底落 save.download
  downloaded.length = 0
  const target = makeEl('div')
  const handle = mountShare(target, {
    artifact: { kind: 'video', url: PAGE_URL, fileUrl: 'blob:file', filename: 'v.mp4' },
  })
  fire(target.children[0], 'click') // video 无图 → 弹 Action Sheet
  const item = findAction(documentStub.body, 'save.download')
  assert.ok(item, 'sheet 里应有 save.download 项（信号兜底走下载，不是 save.album）')
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

test('mount：引导类动作不报「已完成」，按钮显示对应引导文案（非卡片域 → card-wx-link）', async () => {
  // 微信内 link → share.card.wx（引导类）：点按钮不弹分享面板，给一步引导。
  // 这里用**站点追加的普通公开链**（非卡片承载域），走的是既有 card-wx-link 降级路径；
  // 卡片承载域（share.hxym18.com）走 card-wx-shortlink，见下方专门用例。
  setUA('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.0')
  const target = makeEl('div')
  const handle = mountShare(target, {
    artifact: { kind: 'link', url: 'https://cdn.example.com/s/app/1' },
    publicHosts: ['cdn.example.com'],
  })
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

test('isPublicShareUrl：公开短链 true；私有页 / 敏感 query / 非允许域 / 非法一律 false', () => {
  assert.equal(isPublicShareUrl('https://share.hxym18.com/s/app/1'), true)
  // 敏感 query：token / t / access_token
  assert.equal(isPublicShareUrl('https://share.hxym18.com/s/app/1?token=abc'), false)
  assert.equal(isPublicShareUrl('https://share.hxym18.com/s/app/1?t=abc'), false)
  assert.equal(isPublicShareUrl('https://share.hxym18.com/s/app/1?access_token=abc'), false)
  // 私有 host（带 token 的私有页）
  assert.equal(isPublicShareUrl('https://fang.hxym18.com/ledger?token=abc'), false)
  // 非允许域（即使无 token 也不算公开分享链）
  assert.equal(isPublicShareUrl('https://fang.hxym18.com/ledger'), false)
  // 空 / 非法
  assert.equal(isPublicShareUrl(''), false)
  assert.equal(isPublicShareUrl(undefined), false)
  assert.equal(isPublicShareUrl('not a url'), false)
  // 站点声明公开域：**追加**（并集），默认域恒在、不被替换
  assert.equal(isPublicShareUrl('https://cdn.example.com/s/1', ['cdn.example.com']), true)
  assert.equal(isPublicShareUrl('https://share.hxym18.com/s/1', ['cdn.example.com']), true, '默认域恒在（并集，非替换）')
  // 传 [location.hostname] 也不会放行任意域：非公开域仍 false
  assert.equal(isPublicShareUrl('https://fang.hxym18.com/ledger', ['fang.hxym18.com']), true, '站点显式追加的域可用')
  assert.equal(isPublicShareUrl('https://evil.com/s/1', ['fang.hxym18.com']), false, '未声明的域仍 false')
})

test('actionUsesShareUrl：只拦用到分享链的动作；share.system 有文件时不拦', () => {
  for (const a of ['copy.link', 'share.card.wx', 'share.card.miniapp']) {
    assert.equal(actionUsesShareUrl(a, []), true, `${a} 恒用分享链`)
  }
  assert.equal(actionUsesShareUrl('share.system', []), true, 'share.system 无 files → 用 url → 拦')
  assert.equal(actionUsesShareUrl('share.system', [{ name: 'v.mp4' }]), false, 'share.system 有 files → 用文件 → 不拦')
  assert.equal(actionUsesShareUrl('save.album', [{}]), false, '系统面板保存用文件，不用分享链')
  assert.equal(actionUsesShareUrl('save.download', [{}]), false, '下载不用分享链')
})

test('mount：非公开链（私有页 / token）不复制、不分享，给如实反馈（不静默）', async () => {
  setUA('')
  copied = null
  const results = []
  const target = makeEl('div')
  const handle = mountShare(target, {
    artifact: { kind: 'link', url: 'https://fang.hxym18.com/ledger?token=secret' },
    onResult: (r) => results.push(r),
  })
  fire(target.children[0], 'click')
  await tick()
  assert.equal(copied, null, '私有页 URL 绝不能被复制')
  assert.notEqual(target.children[0].textContent, '链接已复制', '不得报复制成功')
  assert.equal(target.children[0].textContent, renderCopy('fail-private-url'), '应给如实反馈')
  assert.equal(results.length, 1, '拒绝也要回报结果，不静默')
  assert.equal(results[0].ok, false)
  assert.equal(results[0].outcome, 'blocked')
  assert.equal(results[0].action, 'copy.link')
  handle.unmount()
})

test('mount：公开短链照常复制（校验不误伤合法分享链）', async () => {
  setUA('')
  copied = null
  const target = makeEl('div')
  const handle = mountShare(target, { artifact: { kind: 'link', url: 'https://share.hxym18.com/s/app/ok' } })
  fire(target.children[0], 'click')
  await tick()
  assert.equal(copied, 'https://share.hxym18.com/s/app/ok')
  handle.unmount()
})

test('mount：宿主复制失败（剪贴板与 execCommand 都失败）→ 不归 done、不假报「链接已复制」', async () => {
  // 判定作用：defaultCopy 静默吞失败时，executeAction 会归 done，按钮假报「链接已复制」；
  // 本用例把 execCommand 置为失败，断言结果如实归 failed、按钮给一步重试。
  setUA('') // 未知环境 link 只剩 copy.link 单一动作，点击直接执行
  copied = null
  execOk = false // execCommand 返回 false（真实浏览器：命令未执行）
  const results = []
  const target = makeEl('div')
  const handle = mountShare(target, {
    artifact: { kind: 'link', url: 'https://share.hxym18.com/s/app/fail' },
    onResult: (r) => results.push(r),
  })
  fire(target.children[0], 'click')
  await tick()
  assert.equal(results.length, 1, '失败也要回报结果，不静默')
  assert.equal(results[0].ok, false, '宿主失败不得归为成功')
  assert.equal(results[0].outcome, 'failed', '宿主失败应归 failed（不得 done）')
  assert.notEqual(target.children[0].textContent, renderCopy('done-copied'), '不得假报「链接已复制」')
  assert.equal(target.children[0].textContent, renderCopy('fail-retry'), '失败应给一步重试')
  handle.unmount()
})

test('mount：非公开链时 share.card.wx（引导类）同样被拦，不报 done', async () => {
  // 微信内 link → sheet 里 share.card.wx；私有 url 必须被闸门拦下
  setUA('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.0')
  const results = []
  const target = makeEl('div')
  const handle = mountShare(target, {
    artifact: { kind: 'link', url: 'https://fang.hxym18.com/ledger?token=secret' },
    onResult: (r) => results.push(r),
  })
  fire(target.children[0], 'click') // 打开 sheet
  const item = findAction(documentStub.body, 'share.card.wx')
  assert.ok(item, 'sheet 里应有 share.card.wx')
  fire(item, 'click')
  await tick()
  assert.equal(target.children[0].textContent, renderCopy('fail-private-url'), '被拦时给如实反馈')
  assert.notEqual(target.children[0].textContent, renderCopy('card-wx-link'), '不得给引导（被拦，未进入引导）')
  assert.equal(results[0].outcome, 'blocked')
  assert.equal(results[0].action, 'share.card.wx')
  handle.unmount()
})

test('mount：站点追加公开域（publicHosts）后该域可用，默认域仍在', async () => {
  setUA('')
  copied = null
  const target = makeEl('div')
  const handle = mountShare(target, {
    artifact: { kind: 'link', url: 'https://cdn.example.com/s/1' },
    publicHosts: ['cdn.example.com'],
  })
  fire(target.children[0], 'click')
  await tick()
  assert.equal(copied, 'https://cdn.example.com/s/1', '追加域应放行')
  handle.unmount()
})

test('mount：站点追加敏感键（sensitiveQueryKeys）后带该 query 的链被拦，默认三键仍拦', async () => {
  setUA('')
  copied = null
  // 未追加 sig：既有行为（放行）
  const okTarget = makeEl('div')
  const okHandle = mountShare(okTarget, {
    artifact: { kind: 'link', url: 'https://share.hxym18.com/s/1?sig=x' },
  })
  fire(okTarget.children[0], 'click')
  await tick()
  assert.equal(copied, 'https://share.hxym18.com/s/1?sig=x', '未追加 sig 时不得改变既有行为')
  okHandle.unmount()

  // 追加 sig：带 sig 的链被拦，不复制
  copied = null
  const blockedTarget = makeEl('div')
  const results = []
  const blockedHandle = mountShare(blockedTarget, {
    artifact: { kind: 'link', url: 'https://share.hxym18.com/s/1?sig=x' },
    sensitiveQueryKeys: ['sig'],
    onResult: (r) => results.push(r),
  })
  fire(blockedTarget.children[0], 'click')
  await tick()
  assert.equal(copied, null, '追加 sig 后带 sig 的链不得复制')
  assert.equal(results[0].outcome, 'blocked')
  blockedHandle.unmount()
})

test('mount：image + files + 私有 url —— share.system 用文件不被误拦（files 接线守护）', async () => {
  // 桌面浏览器 image：share.system 可用；有 files 时用文件、不用 url，故私有 url 不得拦它
  setUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36')
  const nav = globalThis.navigator
  const prevShare = nav.share
  const prevCanShare = nav.canShare
  const prevFile = globalThis.File
  let sharedWith = null
  nav.share = (payload) => {
    sharedWith = payload
    return Promise.resolve()
  }
  nav.canShare = () => true
  globalThis.File = class File {}
  try {
    const file = new globalThis.File()
    const target = makeEl('div')
    const handle = mountShare(target, {
      artifact: {
        kind: 'image',
        url: 'https://fang.hxym18.com/private?token=secret', // 私有 url
        imageUrl: 'https://share.hxym18.com/s/img.png', // 有图 → 弹预览层
        files: [file],
      },
    })
    fire(target.children[0], 'click') // image + 有图 → 预览层
    const item = findAction(documentStub.body, 'share.system')
    assert.ok(item, '预览层里应有 share.system')
    fire(item, 'click')
    await tick()
    assert.ok(sharedWith, 'share.system 应被调用（有文件，不因私有 url 被拦）')
    assert.equal(sharedWith.files.length, 1, '应传文件')
    assert.equal(sharedWith.url, undefined, '有文件时不得混入 url')
    handle.unmount()
  } finally {
    nav.share = prevShare
    nav.canShare = prevCanShare
    globalThis.File = prevFile
  }
})

test('对照：link + 私有 url（无 files）→ share.system 被拦', async () => {
  // 同上环境，但 link 产物不带文件 → share.system 用 url → 私有 url 必须被拦
  setUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36')
  const nav = globalThis.navigator
  const prevShare = nav.share
  const prevCanShare = nav.canShare
  let sharedWith = null
  nav.share = (payload) => {
    sharedWith = payload
    return Promise.resolve()
  }
  nav.canShare = () => true
  const results = []
  try {
    const target = makeEl('div')
    const handle = mountShare(target, {
      artifact: { kind: 'link', url: 'https://fang.hxym18.com/private?token=secret' },
      onResult: (r) => results.push(r),
    })
    fire(target.children[0], 'click') // link → sheet
    const item = findAction(documentStub.body, 'share.system')
    assert.ok(item, 'sheet 里应有 share.system')
    fire(item, 'click')
    await tick()
    assert.equal(sharedWith, null, '私有 url 不得分享')
    assert.equal(results[0].outcome, 'blocked')
    assert.equal(results[0].action, 'share.system')
    handle.unmount()
  } finally {
    nav.share = prevShare
    nav.canShare = prevCanShare
  }
})

test('mount：save.album（系统面板保存）走 navigator.share({files})，不报「已保存」', async () => {
  // iOS Safari image：canShare({files}) 可用 → save.album 入列（系统面板 → 相册/文件）
  setUA('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1')
  const nav = globalThis.navigator
  const prevShare = nav.share
  const prevCanShare = nav.canShare
  const prevFile = globalThis.File
  let sharedWith = null
  nav.share = (payload) => {
    sharedWith = payload
    return Promise.resolve()
  }
  nav.canShare = () => true
  globalThis.File = class File {}
  try {
    const file = new globalThis.File()
    const target = makeEl('div')
    const handle = mountShare(target, {
      artifact: {
        kind: 'image',
        url: 'https://share.hxym18.com/s/ok',
        imageUrl: 'https://share.hxym18.com/s/img.png', // 有图 → 弹预览层
        files: [file],
      },
    })
    fire(target.children[0], 'click') // image + 有图 → 预览层
    const item = findAction(documentStub.body, 'save.album')
    assert.ok(item, '预览层里应有 save.album（系统面板保存）')
    fire(item, 'click')
    await tick()
    assert.ok(sharedWith, 'save.album 应调用 navigator.share（系统面板）')
    assert.equal(sharedWith.files.length, 1, '系统面板保存应传文件')
    assert.equal(sharedWith.url, undefined, 'save.album 不得混入 url')
    // 系统面板里发生什么我们不知道（R7）：不得报「已保存到本机」
    assert.notEqual(target.children[0].textContent, renderCopy('done-saved'))
    handle.unmount()
  } finally {
    nav.share = prevShare
    nav.canShare = prevCanShare
    globalThis.File = prevFile
  }
})

test('mount：image 无 files 时预览层不列 save.album / share.system（files 守卫接线守护）', async () => {
  // iOS Safari image 但 artifact 无 files：canShare 探测为 true 也不得凭它合成「有文件」
  setUA('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1')
  const nav = globalThis.navigator
  const prevShare = nav.share
  const prevCanShare = nav.canShare
  nav.share = () => Promise.resolve()
  nav.canShare = () => true
  try {
    const target = makeEl('div')
    const handle = mountShare(target, {
      artifact: { kind: 'image', url: 'https://share.hxym18.com/s/ok', imageUrl: 'https://share.hxym18.com/s/img.png' }, // 无 files
    })
    fire(target.children[0], 'click') // image + 有图 → 预览层
    assert.equal(findAction(documentStub.body, 'save.album'), null, '无 files 不得列 save.album')
    assert.equal(findAction(documentStub.body, 'share.system'), null, '无 files 不得列带文件的 share.system')
    handle.unmount()
  } finally {
    nav.share = prevShare
    nav.canShare = prevCanShare
  }
})

test('mount：图片预览层过滤长按项后，首个剩余按钮顺延为主推荐（iOS / Android）', async () => {
  // 长按是主推荐但不渲染按钮 → 过滤后若无高亮，必须把首个剩余按钮（save.album）重标为主推荐
  const nav = globalThis.navigator
  const prevShare = nav.share
  const prevCanShare = nav.canShare
  const prevFile = globalThis.File
  nav.share = () => Promise.resolve()
  nav.canShare = () => true
  globalThis.File = class File {}
  const uas = [
    ['iOS', 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'],
    ['Android', 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36'],
  ]
  const isPrimary = (el) => el.className.split(/\s+/).includes('primary')
  try {
    for (const [label, ua] of uas) {
      setUA(ua)
      documentStub.body.children = [] // 清掉上一轮未自动移除的浮层
      const target = makeEl('div')
      const handle = mountShare(target, {
        artifact: {
          kind: 'image',
          url: 'https://share.hxym18.com/s/ok',
          imageUrl: 'https://share.hxym18.com/s/img.png',
          files: [new globalThis.File()],
        },
      })
      fire(target.children[0], 'click') // image + 有图 → 预览层
      const btns = collectByClass(documentStub.body, 'share-kit-preview-btn')
      assert.ok(btns.length >= 2, `${label}：预览层应有多个按钮`)
      assert.equal(btns[0].dataset.action, 'save.album', `${label}：长按不渲染按钮，首个按钮应是 save.album`)
      assert.equal(isPrimary(btns[0]), true, `${label}：首个剩余按钮应被重标为主推荐`)
      assert.equal(btns.filter(isPrimary).length, 1, `${label}：主推荐恰一个`)
      handle.unmount()
    }
  } finally {
    nav.share = prevShare
    nav.canShare = prevCanShare
    globalThis.File = prevFile
  }
})

test('share-kit/ui 运行期导出与 README/类型承诺一致：isPublicShareUrl 可用、内部常量不外泄', async () => {
  const ui = await import('../../src/ui/index.mjs')
  assert.equal(typeof ui.isPublicShareUrl, 'function', '`share-kit/ui` 运行期必须导出 isPublicShareUrl')
  assert.equal(ui.isPublicShareUrl('https://share.hxym18.com/s/1'), true)
  assert.equal(ui.isPublicShareUrl('https://fang.hxym18.com/p?token=s'), false)
  // M2-6：带卡片短链判定同样进 ui 面（README/类型承诺与运行期一致）
  assert.equal(typeof ui.isCardShareUrl, 'function', '`share-kit/ui` 运行期必须导出 isCardShareUrl')
  assert.equal(ui.isCardShareUrl('https://share.hxym18.com/s/1'), true)
  assert.equal(ui.isCardShareUrl('https://cdn.example.com/s/1'), false)
  assert.equal(typeof ui.mountShare, 'function')
  // 内部常量不再经 `export * from './mount'` 泄漏为 ui 公共 API（与收窄后的 index.d.ts 对齐）
  assert.equal('GUIDANCE_COPY_ID' in ui, false)
  assert.equal('SENSITIVE_QUERY_KEYS' in ui, false)
  assert.equal('CARD_SHARE_HOSTS' in ui, false)
  assert.equal('actionUsesShareUrl' in ui, false)
})

test('mount：无下载源（无 files / fileUrl）不列 save.download——A 缺陷真实触发路径（image 预览层）', () => {
  // 桌面 Chromium + 探得 a[download]：旧代码信号兜底会把 save.download 列为主推荐，
  // 点击后 a.href='' 被浏览器解析成当前文档 URL → 下到整页 HTML。
  setUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36')
  documentStub.body.children = []
  const target = makeEl('div')
  const handle = mountShare(target, {
    artifact: { kind: 'image', url: 'https://share.hxym18.com/s/i', imageUrl: 'https://share.hxym18.com/s/i.png' }, // 无 files / fileUrl
  })
  fire(target.children[0], 'click') // image + 有图 → 预览层
  assert.equal(findAction(documentStub.body, 'save.download'), null, '无下载源不得列 save.download')
  handle.unmount()
})

test('mount：无下载源的 video 也不列 save.download（未知环境信号兜底同样被守卫）', () => {
  setUA('') // 未知环境：能力表给不出更强动作，旧代码靠信号兜底把 save.download 列为主推荐
  documentStub.body.children = []
  const target = makeEl('div')
  const handle = mountShare(target, { artifact: { kind: 'video', url: 'https://share.hxym18.com/s/v' } })
  fire(target.children[0], 'click') // video 无图 → Action Sheet
  assert.equal(findAction(documentStub.body, 'save.download'), null, '无下载源不得列 save.download')
  handle.unmount()
})

// —— M2-6：微信内 link + 带卡片短链（share.hxym18.com/s/<id>）→ 引导改「链接自带卡片」——

test('mount：微信内 link + 带卡片短链 → 引导文案用 card-wx-shortlink', async () => {
  // 站点服务端注册短链后把 https://share.hxym18.com/s/<shareId> 作为 artifact.url 传入；
  // 卡片由中转页 og / JS-SDK 产出，这里只把引导从「点右上角」换成「复制即可」。
  setUA('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.0')
  documentStub.body.children = []
  const target = makeEl('div')
  const handle = mountShare(target, { artifact: { kind: 'link', url: 'https://share.hxym18.com/s/card01' } })
  fire(target.children[0], 'click') // 打开 Action Sheet
  const item = findAction(documentStub.body, 'share.card.wx')
  assert.ok(item, '微信内 link 的 sheet 里应有 share.card.wx（仍是引导动作）')
  fire(item, 'click')
  await tick()
  const expected = renderCopy('card-wx-shortlink')
  assert.ok(expected.length > 0, 'card-wx-shortlink 必须有正文')
  assert.equal(target.children[0].textContent, expected, '按钮应显示「链接自带卡片」引导')
  assert.notEqual(target.children[0].textContent, renderCopy('card-wx-link'), '卡片短链不得再用右上角引导')
  const tip = findClass(documentStub.body, 'share-kit-tip')
  assert.ok(tip, '引导类应弹 tip')
  assert.equal(tip.textContent, expected)
  assert.notEqual(target.children[0].textContent, '已完成 · 可再试一次', '仍是引导，不报已完成')
  handle.unmount()
})

test('mount：微信内 link + 非卡片域公开链 → 仍是 card-wx-link（缺省路径不变）', async () => {
  setUA('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.0')
  documentStub.body.children = []
  const target = makeEl('div')
  const handle = mountShare(target, {
    artifact: { kind: 'link', url: 'https://cdn.example.com/s/plain' },
    publicHosts: ['cdn.example.com'],
  })
  fire(target.children[0], 'click')
  const item = findAction(documentStub.body, 'share.card.wx')
  fire(item, 'click')
  await tick()
  assert.equal(target.children[0].textContent, renderCopy('card-wx-link'))
  assert.notEqual(target.children[0].textContent, renderCopy('card-wx-shortlink'))
  handle.unmount()
})

test('mount：微信内 link + 空 url → 现状不变（非公开链拦截，不给任何卡片引导）', async () => {
  setUA('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.0')
  documentStub.body.children = []
  const target = makeEl('div')
  const handle = mountShare(target, { artifact: { kind: 'link' } }) // 无 url
  fire(target.children[0], 'click')
  const item = findAction(documentStub.body, 'share.card.wx')
  fire(item, 'click')
  await tick()
  assert.equal(target.children[0].textContent, renderCopy('fail-private-url'), '空 url 走既有拦截路径')
  assert.notEqual(target.children[0].textContent, renderCopy('card-wx-shortlink'))
  assert.notEqual(target.children[0].textContent, renderCopy('card-wx-link'))
  handle.unmount()
})

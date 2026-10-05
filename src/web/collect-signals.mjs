/**
 * collect-signals.mjs — 浏览器原始信号采集（R3 的采集侧）
 *
 * 分工：**本包采集原始信号，core 只做归一**。本文件是适配层里唯一接触宿主对象的地方，
 * 且一律通过注入的类 window 对象访问（默认取全局对象），因此可以在 node:test 里用假对象覆盖。
 *
 * 只读不写：采集过程绝不往宿主对象上挂属性、改属性。
 */

/** 判断某值是否可当函数调用 */
function isFn(v) {
  return typeof v === 'function'
}

/** 安全取 navigator（不抛错、不改动宿主对象） */
function nav(win) {
  return win && typeof win === 'object' ? win.navigator : null
}

/**
 * 探测「能不能分享文件」。
 * `canShare` 只校验数据结构、不校验目标应用，因此它只是倾向而非保证；拿不到 File 构造器时
 * 一律记 false（宁可少给一个动作，也不给一个点了没反应的按钮）。
 */
function detectCanShareFiles(win) {
  try {
    const n = nav(win)
    if (!n || !isFn(n.canShare) || !isFn(win.File)) return false
    const probe = new win.File([new win.Uint8Array(1)], 'probe.png', { type: 'image/png' })
    return n.canShare({ files: [probe] }) === true
  } catch {
    return false
  }
}

/** 探测是否已装到桌面（独立窗口运行） */
function detectStandalone(win) {
  try {
    if (!win || !isFn(win.matchMedia)) return false
    return win.matchMedia('(display-mode: standalone)').matches === true
  } catch {
    return false
  }
}

/** 探测是否支持 a[download]（决定能不能直接下载） */
function detectDownloadAttr(win) {
  try {
    const doc = win && win.document
    if (!doc || !isFn(doc.createElement)) return false
    const a = doc.createElement('a')
    return a ? 'download' in a : false
  } catch {
    return false
  }
}

/** 探测是否有一次性用户激活（系统分享面板的前提）；取不到记 'unknown'，绝不冒充 false */
function detectTransientActivation(win) {
  try {
    const ua = nav(win) && nav(win).userActivation
    if (ua && typeof ua.isActive === 'boolean') return ua.isActive
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

/**
 * 采集原始信号。`win` 为类 window 对象（默认全局对象）。
 * 返回对象即 core `normalizeFingerprint` 的入参；所有字段都可能缺，缺了 core 会判 unknown。
 */
export function collectSignals(win = typeof globalThis === 'undefined' ? {} : globalThis) {
  const n = nav(win)
  const touch = n && typeof n.maxTouchPoints === 'number' ? n.maxTouchPoints : undefined
  return {
    ua: n && typeof n.userAgent === 'string' ? n.userAgent : '',
    maxTouchPoints: touch,
    isSecureContext: Boolean(win && win.isSecureContext === true),
    canShareFiles: detectCanShareFiles(win),
    hasStandaloneDisplayMode: detectStandalone(win),
    hasDownloadAttr: detectDownloadAttr(win),
    hasTransientActivation: detectTransientActivation(win),
  }
}
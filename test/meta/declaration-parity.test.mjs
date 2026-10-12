/**
 * declaration-parity.test.mjs — 手写声明（`*.d.ts`）与运行时的**漂移守卫**。
 *
 * 起因（真实缺陷）：`share-kit v0.7.0` 的 `RawSignals` 声明漏了运行时已在用的
 * `hasShare`（采集侧 `collectSignals` 产出）与 `hasDownloadSource`（core 读取、`mountShare` 给出）。
 * 类型声明漂移不会让测试变红，只会让消费站（TS 站）**写对了也报类型错**、或调错也不报错——
 * 所以要有断言把「声明 ⊇ 运行时」钉住，而不是靠人记得改两处。
 *
 * 口径（单向）：**运行时用到的信号键，声明里必须都有**。声明多出的键不算漂移
 * （可能是保留位/未来位），但会由测试 ③ 显式列出，便于人工确认。
 */
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import test from 'node:test'
import { collectSignals } from '../../src/web/collect-signals.mjs'

const PROBE_DTS = new URL('../../src/core/probe.d.ts', import.meta.url)
const CORE_DIR = new URL('../../src/core/', import.meta.url)

/** `RawSignals` 声明的键集合（解析手写 .d.ts；锚点缺失即抛，不静默放过） */
function declaredRawSignalsKeys() {
  const src = readFileSync(PROBE_DTS, 'utf8')
  const block = /export interface RawSignals \{([\s\S]*?)\n\}/.exec(src)
  assert.ok(block, '未找到 `export interface RawSignals {...}`（被改名/移除？本守卫需同步）')
  const keys = [...block[1].matchAll(/^\s+([A-Za-z_$][\w$]*)\??:/gm)].map((m) => m[1])
  assert.ok(keys.length > 0, 'RawSignals 未解析出任何字段（解析口径与 .d.ts 形态漂移）')
  return new Set(keys)
}

/** 采集侧实际产出的键（直接跑一遍纯函数，拿真实返回值，不靠正则猜） */
function collectedKeys() {
  return new Set(Object.keys(collectSignals({ navigator: { userAgent: 'probe', maxTouchPoints: 1 } })))
}

/** core 里**读取**过的信号键（`signals.x` 与 decide.mjs 里的 `s.x` 别名） */
function coreReadKeys() {
  const keys = new Set()
  for (const file of readdirSync(CORE_DIR)) {
    if (!file.endsWith('.mjs')) continue
    const src = readFileSync(new URL(file, CORE_DIR), 'utf8')
    for (const m of src.matchAll(/\bsignals\.([A-Za-z_$][\w$]*)/g)) keys.add(m[1])
    // decide.mjs 把入参 signals 绑成局部别名 `s`；绑定形态一变即抛（否则守卫会假绿）
    if (/\bsignals\b/.test(src)) {
      const aliased = /const s = signals .*signals : \{\}/.test(src)
      for (const m of src.matchAll(/\bs\.([A-Za-z_$][\w$]*)/g)) {
        if (!aliased) throw new Error(`core/${file} 出现 \`s.xxx\` 但未匹配到 signals 别名绑定，守卫锚点失效`)
        keys.add(m[1])
      }
    }
  }
  return keys
}

test('RawSignals 声明 ⊇ 采集侧 collectSignals 产出的键', () => {
  const declared = declaredRawSignalsKeys()
  const missing = [...collectedKeys()].filter((k) => !declared.has(k))
  assert.deepEqual(missing, [], `collectSignals 产出的信号未在 RawSignals 声明：${missing.join(', ')}`)
})

test('RawSignals 声明 ⊇ core 读取的信号键（含 decide 的 s.* 别名）', () => {
  const declared = declaredRawSignalsKeys()
  const missing = [...coreReadKeys()].filter((k) => !declared.has(k))
  assert.deepEqual(missing, [], `core 读取的信号未在 RawSignals 声明：${missing.join(', ')}`)
})

test('声明多出的键显式列出（不自动判失败，便于人工确认是保留位还是残留）', () => {
  const declared = declaredRawSignalsKeys()
  const used = new Set([...collectedKeys(), ...coreReadKeys()])
  const unused = [...declared].filter((k) => !used.has(k))
  // 已知保留位：环境探测由 core 内部读取 ua/maxTouchPoints/isSecureContext 的归一逻辑消费
  const KNOWN_RESERVED = new Set(['ua', 'maxTouchPoints', 'isSecureContext'])
  const unexpected = unused.filter((k) => !KNOWN_RESERVED.has(k))
  assert.deepEqual(unexpected, [], `声明里出现既未采集、也未被 core 读取的键：${unexpected.join(', ')}（确认后加入 KNOWN_RESERVED 或删声明）`)
})

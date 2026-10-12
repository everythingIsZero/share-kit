/**
 * declaration-parity.test.mjs — 手写声明（`*.d.ts`）与运行时的**漂移守卫**。
 *
 * 起因（真实缺陷）：`share-kit v0.7.0` 的 `RawSignals` 声明漏了运行时已在用的
 * `hasShare`（采集侧 `collectSignals` 产出）与 `hasDownloadSource`（core 读取、`mountShare` 给出）；
 * 同类漏键还有 `share-kit/web` 的 `CollectedSignals`。类型声明漂移不会让功能测试变红，
 * 只会让 TS 消费站**写对了也报类型错**（`TS2353 Object literal may only specify known properties`）。
 *
 * 观测量只取「**运行时真实发生的属性访问**」——不管代码怎么写（`signals.x`、别名 `src.x` / `s.x`、
 * 解构 `const { x } = signals`），只要读了就会被 Proxy 记下。上一版用正则扫 `signals.` / `s.`，
 * 会被别名与解构绕过而**假绿**（评审变异已证），故弃用。
 *
 * 口径：
 *   ① `RawSignals` 是 core 的信号契约 → 必须 ⊇ 采集侧产出的环境信号、⊇ core 读取的键；
 *   ② `CollectedSignals` 是采集函数的返回类型 → 与 `collectSignals()` 实际键**精确相等**；
 *   ③ core 还会读「artifact 侧」信号（`hasFiles` / `hasDownloadSource`，由适配包按产物给，不属环境采集）；
 *   ④ 声明不得留下「既非采集、也非读取」的死键。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { collectSignals } from '../../src/web/collect-signals.mjs'
import { normalizeFingerprint } from '../../src/core/probe.mjs'
import { listActions, decideAction } from '../../src/core/decide.mjs'

const PROBE_DTS = new URL('../../src/core/probe.d.ts', import.meta.url)
const COLLECT_DTS = new URL('../../src/web/collect-signals.d.ts', import.meta.url)

/** **artifact 侧**信号：由适配包按实际产物给出（不是环境探测），故不属 `collectSignals` 的产出 */
const ARTIFACT_SIGNALS = new Set(['hasFiles', 'hasDownloadSource'])

/** 解析某个手写接口声明的键集合（锚点缺失即抛，不静默放过） */
function declaredKeys(dtsUrl, interfaceName) {
  const src = readFileSync(dtsUrl, 'utf8')
  const block = new RegExp(`export interface ${interfaceName} \\{([\\s\\S]*?)\\n\\}`).exec(src)
  assert.ok(block, `未找到 \`export interface ${interfaceName} {...}\`（被改名/移除？本守卫需同步）`)
  const keys = [...block[1].matchAll(/^\s+([A-Za-z_$][\w$]*)\??:/gm)].map((m) => m[1])
  assert.ok(keys.length > 0, `${interfaceName} 未解析出任何字段（解析口径与 .d.ts 形态漂移）`)
  return new Set(keys)
}

/** 采集侧实际产出的键（跑真函数取返回值的键，不靠正则猜） */
function collectedKeys() {
  return new Set(Object.keys(collectSignals({ navigator: { userAgent: 'probe', maxTouchPoints: 1 } })))
}

/**
 * 用 Proxy 观测「core 在一次真实决策里读了哪些信号键」。
 * 同一份信号对象喂多个取值变体（undefined / true / false / 'unknown'），覆盖按值分叉的分支；
 * 每次读取都记账，因此别名、解构、`Object.keys` 之外的转发都逃不掉。
 */
function coreReadKeys() {
  const read = new Set()
  const trapFor = (value) =>
    new Proxy(
      {},
      {
        get: (_t, k) => {
          if (typeof k === 'string') read.add(k)
          return value
        },
        has: (_t, k) => {
          if (typeof k === 'string') read.add(k)
          return false
        },
      },
    )
  const fingerprint = normalizeFingerprint({ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1' }).fingerprint
  for (const value of [undefined, true, false, 'unknown']) {
    normalizeFingerprint(trapFor(value))
    for (const artifactKind of ['image', 'link']) {
      listActions({ fingerprint, artifactKind, signals: trapFor(value) })
      decideAction({ fingerprint, artifactKind, signals: trapFor(value) })
    }
  }
  assert.ok(read.size > 0, '未观测到任何信号读取（决策入口签名漂移？本守卫需同步）')
  return read
}

test('RawSignals 声明 ⊇ 采集侧 collectSignals 产出的键', () => {
  const declared = declaredKeys(PROBE_DTS, 'RawSignals')
  const missing = [...collectedKeys()].filter((k) => !declared.has(k))
  assert.deepEqual(missing, [], `collectSignals 产出的信号未在 RawSignals 声明：${missing.join(', ')}`)
})

test('RawSignals 声明 ⊇ core 读取的信号键（Proxy 观测，别名/解构同样可见）', () => {
  const declared = declaredKeys(PROBE_DTS, 'RawSignals')
  const missing = [...coreReadKeys()].filter((k) => !declared.has(k))
  assert.deepEqual(missing, [], `core 读取的信号未在 RawSignals 声明：${missing.join(', ')}`)
})

test('CollectedSignals 与 collectSignals() 实际键精确相等（多一个少一个即红）', () => {
  const declared = declaredKeys(COLLECT_DTS, 'CollectedSignals')
  const produced = collectedKeys()
  assert.deepEqual([...declared].sort(), [...produced].sort(), '采集函数返回类型与实现漂移')
})

test('core 读的环境信号必须仍由采集侧产出（停发即红）', () => {
  const produced = collectedKeys()
  const stray = [...coreReadKeys()].filter((k) => !produced.has(k) && !ARTIFACT_SIGNALS.has(k))
  assert.deepEqual(stray, [], `core 读了采集侧已不产出的环境信号：${stray.join(', ')}`)
})

test('RawSignals 不得留死键（既非采集产出、也非 core 读取）', () => {
  const declared = declaredKeys(PROBE_DTS, 'RawSignals')
  const alive = new Set([...collectedKeys(), ...coreReadKeys()])
  const dead = [...declared].filter((k) => !alive.has(k))
  assert.deepEqual(dead, [], `声明里出现既未采集、也未被 core 读取的键：${dead.join(', ')}（删声明，或补一处真实使用）`)
})

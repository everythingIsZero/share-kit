/**
 * react.test.mjs — React 绑定（Unit 5 场景 10-13）
 *
 * 纯函数层（位置计算、触发态归约）全部可在 node 下断言；
 * 另外两条是结构断言：主入口不拉 React、运行时依赖只有 core。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { computeOverlayPosition, reduceTrigger, IDLE_VIEW } from '../../src/web/react.mjs'

const readSource = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8')

test('React 子路径隔离：主入口源码不含 react，也不 re-export react 子模块', () => {
  const source = readSource('../../src/web/index.mjs')
  assert.equal(/from\s+['"]react['"]/.test(source), false, '主入口不得 import react')
  assert.equal(/from\s+['"]\.\/react\.mjs['"]/.test(source), false, '主入口不得导出 react 绑定')
})

test('触发态与失败态归约：点击进已触发态，失败给一步引导', () => {
  const clicked = reduceTrigger('idle', { type: 'click' })
  assert.equal(clicked.disabled, true)
  assert.equal(clicked.visual, 'progress')
  assert.equal(clicked.status, 'running')

  const failed = reduceTrigger('running', { type: 'fail' })
  assert.equal(failed.disabled, false)
  assert.equal(failed.visual, 'inline-guidance')

  const settled = reduceTrigger('running', { type: 'settle', outcome: 'cancelled' })
  assert.equal(settled.status, 'idle')
  assert.equal(settled.disabled, false)

  assert.deepEqual(reduceTrigger('done', { type: 'reset' }), { ...IDLE_VIEW })
})

test('引导层位置动态计算：纯函数、随容器 UI 高度变化、无写死坐标', () => {
  const safeArea = { top: 0, bottom: 34, left: 0, right: 0 }
  const a = computeOverlayPosition(safeArea, 280)
  const b = computeOverlayPosition(safeArea, 280)
  assert.deepEqual(a, b) // 纯函数
  assert.equal(a.top, 0 + 0 + 8)
  assert.equal(a.bottom, 34 + 280 + 8)

  const taller = computeOverlayPosition(safeArea, 320)
  assert.notEqual(a.bottom, taller.bottom) // 随容器 UI 高度变化

  const twoSided = computeOverlayPosition(safeArea, { top: 10, bottom: 20 })
  assert.equal(twoSided.top, 0 + 10 + 8)
  assert.equal(twoSided.bottom, 34 + 20 + 8)

  // 源码里不得出现写死的坐标常量（0 表示「该侧无容器 UI」，不是坐标；非零字面量才是写死）
  const source = readSource('../../src/web/react.mjs')
  assert.equal(/(top|bottom|left|right):\s*[1-9]/.test(source), false, '不得写死坐标')
})

test('依赖形状受控：web 源码只依赖包内路径，react 仅 react.mjs 且在可选 peer', () => {
  const pkg = JSON.parse(readSource('../../package.json'))
  assert.ok(pkg.peerDependencies.react, 'react 必须在 peerDependencies')
  assert.equal(pkg.peerDependenciesMeta.react.optional, true, 'react 必须是可选 peer')

  // 单包多入口：web 主入口源码的 import 只允许指向包内（core 相对路径或同目录），
  // 任何第三方 import（含 react）都不许出现在主入口链上
  for (const file of ['collect-signals.mjs', 'execute.mjs', 'report.mjs', 'index.mjs']) {
    const source = readSource(`../../src/web/${file}`)
    for (const m of source.matchAll(/from '([^']+)'/g)) {
      assert.ok(
        m[1].startsWith('./') || m[1].startsWith('../core/'),
        `${file} 依赖越界（只许包内相对路径）：${m[1]}`
      )
    }
  }

  // react.mjs 是唯一允许 import react 的文件，其余仍只许包内路径
  const reactSrc = readSource('../../src/web/react.mjs')
  for (const m of reactSrc.matchAll(/from '([^']+)'/g)) {
    assert.ok(
      m[1] === 'react' || m[1].startsWith('./') || m[1].startsWith('../core/'),
      `react.mjs 依赖越界：${m[1]}`
    )
  }
})

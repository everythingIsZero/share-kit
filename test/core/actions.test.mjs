/**
 * tests/actions.test.mjs — 动作枚举与包骨架边界（node:test，零依赖）
 * 覆盖 Unit 1 第 1、8 条：枚举完整且无多余项 / 包无第三方依赖且可被 Node 解析
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

import { ACTIONS, ACTION_IDS, ARTIFACT_KINDS, isActionId, isArtifactKind } from '../../src/core/actions.mjs'

test('动作枚举完整且无多余项（六项，逐字面量比对）', () => {
  const expected = ['save.album', 'share.system', 'share.card.wx', 'share.card.miniapp', 'copy.link', 'preview.longpress']
  assert.deepEqual(Object.keys(ACTIONS).sort(), [...expected].sort())
  assert.deepEqual([...ACTION_IDS].sort(), [...expected].sort())
  assert.equal(ACTION_IDS.length, 6)
})

test('每个动作都有短码与中文名，且短码不重复', () => {
  for (const id of ACTION_IDS) {
    const meta = ACTIONS[id]
    assert.equal(typeof meta.shortCode, 'string')
    assert.ok(meta.shortCode.length > 0, `${id} 缺 shortCode`)
    assert.ok(/[\u4e00-\u9fff]/.test(meta.label), `${id} 的 label 应为中文`)
    assert.ok(['save', 'share', 'fallback'].includes(meta.family), `${id} 的 family 越界`)
  }
  const codes = ACTION_IDS.map((id) => ACTIONS[id].shortCode)
  assert.equal(new Set(codes).size, codes.length, 'shortCode 必须唯一')
})

test('产物种类恰为 image / video / link', () => {
  assert.deepEqual([...ARTIFACT_KINDS], ['image', 'video', 'link'])
  assert.equal(isArtifactKind('image'), true)
  assert.equal(isArtifactKind('audio'), false)
  assert.equal(isArtifactKind(null), false)
  assert.equal(isArtifactKind(undefined), false)
})

test('isActionId：只认枚举内字符串，越界与非法类型一律 false', () => {
  assert.equal(isActionId('copy.link'), true)
  assert.equal(isActionId('save.album'), true)
  assert.equal(isActionId('save.photo'), false)
  assert.equal(isActionId(''), false)
  assert.equal(isActionId(null), false)
  assert.equal(isActionId(1), false)
  // 防原型链穿透
  assert.equal(isActionId('toString'), false)
  assert.equal(isActionId('constructor'), false)
})

test('core 源码零第三方依赖且可被 Node 解析', async () => {
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
  assert.equal(pkg.name, '@hxym18/share-kit')
  assert.equal(pkg.type, 'module')

  // 单包多入口：render-dom 的重依赖（html2canvas-pro / qrcode）挂在包级 dependencies 上，
  // 「core 零依赖」的口径因此落在源码层：core 目录里的 .mjs 只允许相对路径 import
  const coreFiles = readdirSync(new URL('../../src/core/', import.meta.url)).filter((f) => f.endsWith('.mjs'))
  assert.ok(coreFiles.length > 0, 'src/core/ 应有源文件')
  for (const file of coreFiles) {
    const src = readFileSync(new URL(`../../src/core/${file}`, import.meta.url), 'utf8')
    for (const m of src.matchAll(/from '([^']+)'/g)) {
      assert.ok(m[1].startsWith('./'), `${file} 不得引入第三方或跨目录依赖：${m[1]}`)
    }
  }

  const mod = await import('../../src/core/index.mjs')
  assert.equal(typeof mod.ACTIONS, 'object')
})
/**
 * index.mjs — share-kit core 公共出口（re-export；包入口 `.`）
 *
 * 决策层单源：动作枚举、文案表、能力表、环境指纹归一、动作决策、结果分类。
 * 本包零宿主依赖（不 import window / navigator / document，也不 import 任何平台 SDK），
 * 因此可以在 node:test 里被完整覆盖，不需要真浏览器。
 */

export * from './actions.mjs'
export * from './copy.mjs'
export * from './capability-table.mjs'
export * from './probe.mjs'
export * from './decide.mjs'
export * from './outcome.mjs'
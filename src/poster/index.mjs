/**
 * index.mjs — share-kit poster 公共出口（re-export；包入口 `./poster`）
 *
 * 海报配置层单源：版式尺寸、主题色板、冻结快照（resolveSpec）。
 * 本入口零 DOM / canvas 依赖，小游戏环境可直接 import。
 */

export * from './spec.mjs'

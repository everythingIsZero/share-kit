/**
 * node 出口（`@hxym18/share-kit/node`）——**服务端专用**：短链注册等需要密钥/网络的能力。
 * 浏览器侧能力在 `.`（core）/`./ui`/`./web`/`./render-dom`；本出口不进前端 bundle。
 */
export { createShareBridgeClient, DEFAULT_BRIDGE_BASE, BRIDGE_OUTCOMES } from './share-bridge-client.mjs'

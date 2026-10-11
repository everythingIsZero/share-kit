export type BridgeOutcome =
  | 'unauthorized'
  | 'invalid'
  | 'rate_limited'
  | 'unavailable'
  | 'network'
  | 'bad_response'
  | 'store_failed'

export type BridgeResult =
  | { ok: true; shareId: string; shortUrl: string; status?: number; cached?: boolean }
  | { ok: false; outcome: BridgeOutcome; status?: number; error?: string }

export declare const DEFAULT_BRIDGE_BASE: string
export declare const BRIDGE_OUTCOMES: Readonly<Record<'UNAUTHORIZED' | 'INVALID' | 'RATE_LIMITED' | 'UNAVAILABLE' | 'NETWORK' | 'BAD_RESPONSE' | 'STORE_FAILED', BridgeOutcome>>

export interface ShareBridgeClientOptions {
  /** `x-auth-secret`（**只服务端**；给函数则每次请求现读 env） */
  secret: string | (() => string)
  /** 归属标识（bridge 落库用，≤128） */
  owner: string
  baseUrl?: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

export interface ShareBridgeStore {
  get(key: string): Promise<string | null> | string | null
  set(key: string, shortUrl: string): Promise<void> | void
}

export declare function createShareBridgeClient(opts: ShareBridgeClientOptions): {
  register(input: { targetUrl: string; card?: Record<string, unknown> }): Promise<BridgeResult>
  ensureShortLink(input: {
    key: string
    targetUrl: string
    card?: Record<string, unknown>
    store: ShareBridgeStore
  }): Promise<BridgeResult>
  shortUrlFor(shareId: string): string
  baseUrl: string
  owner: string
}

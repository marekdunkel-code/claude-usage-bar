export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

export type Snap = {
  ctxPercent: number | null
  ctxTokens: number
  ctxWindow: number
  cacheLast: number | null
  cacheAll: number | null
  limits: Limit[]
  usd: number | null
}

declare module 'claude-code' {
  interface PluginState {
    'usage-bar': { snap: Snap | null }
  }
}

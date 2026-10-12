import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Limit, Snap } from '../types'

const snapAtom = atom({ plugin: 'usage-bar', key: 'snap' } as const, null)

function tokens(n: number): string {
  return n >= 1000 ? `${Math.round(n / 1000)}k` : String(n)
}

function left(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}d${h}h`
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}m`
  return `${m}m`
}

function tone(pct: number): 'success' | 'warning' | 'error' {
  return pct >= 90 ? 'error' : pct >= 70 ? 'warning' : 'success'
}

type Cache = { read: number; total: number; last: number | null }

async function refresh($: EngineInterface, c: Cache) {
  const u = await $.session.usage()
  const snap: Snap = {
    ctxPercent: u.context.percent ?? null,
    ctxTokens: u.context.tokens ?? 0,
    ctxWindow: u.context.window,
    cacheLast: c.last,
    cacheAll: c.total > 0 ? Math.round((c.read * 100) / c.total) : null,
    limits: u.rateLimits,
    usd: u.cost?.usd ?? null,
  }
  await update($, snapAtom, () => snap)
}

export const register: Register = on => {
  // cache: sumy z całej sesji (zerują się przy przeładowaniu moda)
  const c: Cache = { read: 0, total: 0, last: null }
  // ostrzeżenia: każde raz po przekroczeniu progu, znów dopiero po zejściu poniżej
  const warned = { ctx: false, five: false, week: false }

  on('session.start', async ($, e, next) => {
    $.ui.toast('usage-bar załadowany')
    await refresh($, c)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined && e.usage) {
      const u = e.usage
      const sum = u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens
      if (sum > 0) {
        c.read += u.cache_read_input_tokens
        c.total += sum
        c.last = Math.round((u.cache_read_input_tokens * 100) / sum)
      }
    }
    const r = await next(e)
    await refresh($, c)
    return r
  })

  on('session.measure', async ($, e, next) => {
    await refresh($, c)

    const ctxPct = e.context.percent ?? 0
    const five = e.rateLimits.find(l => l.kind === 'five_hour')?.percentUsed ?? 0
    const week = e.rateLimits.find(l => l.kind === 'seven_day')?.percentUsed ?? 0

    if (ctxPct >= 85 && !warned.ctx) $.ui.toast(`Kontekst ${Math.round(ctxPct)}% — rozważ /compact lub nową sesję`)
    if (five >= 80 && !warned.five) $.ui.toast(`Limit 5h: ${Math.round(five)}% zużyte`)
    if (week >= 80 && !warned.week) $.ui.toast(`Limit tygodniowy: ${Math.round(week)}% zużyte`)

    warned.ctx = ctxPct >= 85
    warned.five = five >= 80
    warned.week = week >= 80

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const s = await read($, snapAtom)
    if (e.props.hasSurvey) return next(e)
    if (s === null) {
      const { Box: B, Text: T } = $.ui.resolve(e)
      return (
        <B>
          <T dimColor>usage-bar: czekam na pierwsze dane…</T>
        </B>
      )
    }

    const now = await $.clock.now()
    const { Box, Text } = $.ui.resolve(e)

    const limit = (label: string, kind: string) => {
      const l: Limit | undefined = s.limits.find(x => x.kind === kind)
      if (!l) return null
      const t = l.resetsAt ? Date.parse(l.resetsAt) : NaN
      const reset = Number.isNaN(t) ? '' : ` ↻${left(t - now)}`
      return (
        <Text color={tone(l.percentUsed)}>
          {label} {Math.round(l.percentUsed)}%{reset}
        </Text>
      )
    }

    const five = limit('5h', 'five_hour')
    const week = limit('7d', 'seven_day')

    return (
      <Box>
        <Text color={s.ctxPercent === null ? 'subtle' : tone(s.ctxPercent)}>
          ctx {s.ctxPercent === null ? '--' : `${Math.round(s.ctxPercent)}% (${tokens(s.ctxTokens)}/${tokens(s.ctxWindow)})`}
        </Text>
        <Text dimColor>{'  │  '}</Text>
        <Text>
          cache {s.cacheLast === null ? '--' : `${s.cacheLast}% (sesja ${s.cacheAll}%)`}
        </Text>
        {five ? <Text dimColor>{'  │  '}</Text> : null}
        {five}
        {week ? <Text dimColor>{'  │  '}</Text> : null}
        {week}
        {s.usd === null ? null : <Text dimColor>{`  │  $${s.usd.toFixed(2)}`}</Text>}
      </Box>
    )
  })
}

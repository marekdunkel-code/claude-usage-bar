import { test, expect } from 'claude-code/testing'

test('session.measure: toast przy 50% kontekstu zachęca do kompaktowania', async ($, on) => {
  const toasts: string[] = []
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: { tokens: 110000, window: 200000, percent: 55 },
      rateLimits: [],
      cost: { usd: 1 },
    },
  }))
  on('session.measure', () => ({ changed: [] }))
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  await $.session.measure({
    context: { tokens: 110000, window: 200000, percent: 55 },
    rateLimits: [],
  } as never)
  expect(toasts.join(' ')).toContain('Kompaktuj')
})

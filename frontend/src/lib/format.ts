const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: 'short' })
const dateShort = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' })
const dateLong = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' })
const clock = new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' })
const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })

export function timeAgo(iso: string, now = Date.now()): string {
  const seconds = Math.round((Date.parse(iso) - now) / 1000)
  const abs = Math.abs(seconds)
  if (abs < 45) return 'now'
  if (abs < 3600) return relative.format(Math.round(seconds / 60), 'minute')
  if (abs < 86_400) return relative.format(Math.round(seconds / 3600), 'hour')
  if (abs < 7 * 86_400) return relative.format(Math.round(seconds / 86_400), 'day')
  return dateShort.format(new Date(iso))
}

export const formatJoined = (iso: string) => `Joined ${dateLong.format(new Date(iso))}`
export const formatClock = (iso: string) => clock.format(new Date(iso))
export const formatCount = (n: number) => compact.format(n)
export const plural = (n: number, one: string, many = `${one}s`) => `${formatCount(n)} ${n === 1 ? one : many}`

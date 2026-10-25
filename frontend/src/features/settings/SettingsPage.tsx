import type { components } from '@/api/schema'
import { ErrorState, PageSpinner } from '@/components/feedback'
import { Button } from '@/components/ui/Button'
import { BackendSwitcher } from '@/features/backends/BackendSwitcher'
import { useLogout, useMe } from '@/features/auth/api'
import { usePreferences, useUpdatePreferences } from '@/features/notifications/api'
import { PageHeader } from '@/features/shell/PageHeader'
import { useSession } from '@/stores/session'

type Prefs = components['schemas']['NotificationPreferences']
type Channel = 'inApp' | 'email' | 'push'

const TYPE_LABEL: Record<string, string> = {
  follow: 'New followers',
  post_like: 'Likes on your posts',
  post_comment: 'Comments on your posts',
  comment_reply: 'Replies to your comments',
  comment_like: 'Likes on your comments',
  post_share: 'Shares of your posts',
  mention: 'Mentions',
  message: 'Direct messages',
}
const CHANNELS: Array<[Channel, string]> = [
  ['inApp', 'In app'],
  ['email', 'Email'],
  ['push', 'Push'],
]

const sectionClass = 'border-b border-line px-4 py-6'
const headingClass = 'text-lg font-bold'

function NotificationPreferences() {
  const query = usePreferences()
  const update = useUpdatePreferences()
  if (query.isPending) return <PageSpinner />
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />

  const prefs = query.data
  const toggle = (type: string, channel: Channel) => {
    const current = prefs.channels[type]
    const next: Prefs = { channels: { ...prefs.channels, [type]: { ...current, [channel]: !current[channel] } } }
    update.mutate(next)
  }

  return (
    <table className="mt-4 w-full text-sm">
      <thead>
        <tr className="text-left text-muted">
          <th className="py-2 font-medium">Notify me about</th>
          {CHANNELS.map(([key, label]) => (
            <th key={key} className="w-16 py-2 text-center font-medium">
              {label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Object.keys(prefs.channels).map((type) => (
          <tr key={type} className="border-t border-line">
            <td className="py-2.5">{TYPE_LABEL[type] ?? type}</td>
            {CHANNELS.map(([channel, label]) => (
              <td key={channel} className="text-center">
                <input
                  type="checkbox"
                  className="size-4 cursor-pointer accent-ink"
                  checked={prefs.channels[type][channel]}
                  onChange={() => toggle(type, channel)}
                  aria-label={`${TYPE_LABEL[type] ?? type}: ${label}`}
                />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function SettingsPage() {
  const { data: me } = useMe()
  const logout = useLogout()
  const respectStatus = useSession((s) => s.respectStatus)
  const setRespectStatus = useSession((s) => s.setRespectStatus)

  return (
    <>
      <PageHeader title="Settings" />
      <section className={sectionClass}>
        <h2 className={headingClass}>Backend</h2>
        <p className="mt-1 mb-4 text-sm text-muted">
          All four speak the same API contract. Switching keeps your session on each one.
        </p>
        <div className="rounded-2xl border border-line p-2">
          <BackendSwitcher />
        </div>
        <label className="mt-5 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-ink"
            checked={respectStatus}
            onChange={(e) => setRespectStatus(e.target.checked)}
          />
          <span>
            <span className="block text-sm font-medium">Only call endpoints marked LIVE</span>
            <span className="block text-sm text-muted">
              Turn this off while building a backend to call operations before you flip their x-status.
            </span>
          </span>
        </label>
      </section>

      <section className={sectionClass}>
        <h2 className={headingClass}>Notifications</h2>
        <NotificationPreferences />
      </section>

      <section className={sectionClass}>
        <h2 className={headingClass}>Account</h2>
        {me && (
          <p className="mt-1 text-sm text-muted">
            Signed in as <strong className="text-fg">@{me.username}</strong> ({me.email})
          </p>
        )}
        <Button variant="secondary" className="mt-4" onClick={() => logout.mutate()} disabled={logout.isPending}>
          Sign out
        </Button>
      </section>
    </>
  )
}

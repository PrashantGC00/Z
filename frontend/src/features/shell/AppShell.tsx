import { type ReactNode, Suspense } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { Bell, Bookmark, Compass, Home, MessageSquare, Settings, User } from 'lucide-react'
import { Avatar } from '@/components/Avatar'
import { PageSpinner } from '@/components/feedback'
import { Badge } from '@/components/ui/Badge'
import { BACKENDS } from '@/config/backends'
import { useMe } from '@/features/auth/api'
import { BackendSwitcher } from '@/features/backends/BackendSwitcher'
import { WhenLive } from '@/features/backends/Gate'
import { useUnreadCounts } from '@/features/notifications/api'
import { SearchBox, SuggestionList, TrendingList } from '@/features/search/widgets'
import { cn } from '@/lib/cn'
import { useRealtime } from '@/realtime/RealtimeProvider'
import { useSession } from '@/stores/session'

interface NavItem {
  to: string
  label: string
  icon: typeof Home
  badge?: number
  mobile?: boolean
}

function useNavItems(): NavItem[] {
  const { data: me } = useMe()
  const { data: unread } = useUnreadCounts()
  return [
    { to: '/', label: 'Home', icon: Home, mobile: true },
    { to: '/explore', label: 'Explore', icon: Compass, mobile: true },
    { to: '/notifications', label: 'Notifications', icon: Bell, badge: unread?.notifications, mobile: true },
    { to: '/messages', label: 'Messages', icon: MessageSquare, badge: unread?.messages, mobile: true },
    { to: '/bookmarks', label: 'Saved', icon: Bookmark },
    { to: me ? `/u/${me.username}` : '/settings', label: 'Profile', icon: User, mobile: true },
    { to: '/settings', label: 'Settings', icon: Settings },
  ]
}

function NavBadge({ count, className }: { count?: number; className?: string }) {
  if (!count) return null
  return (
    <Badge tone="count" className={className}>
      {count > 99 ? '99+' : count}
      <span className="sr-only"> unread</span>
    </Badge>
  )
}

function SideNav() {
  const items = useNavItems()
  const { data: me } = useMe()
  const { state } = useRealtime()

  return (
    <nav aria-label="Main" className="sticky top-0 hidden h-dvh flex-col gap-1 overflow-y-auto px-3 py-4 md:flex">
      <NavLink to="/" aria-label="Z home" className="mb-4 flex h-9 items-center justify-center px-3 lg:justify-start">
        <img src="/favicon.svg" alt="" className="size-8" />
      </NavLink>
      {items.map(({ to, label, icon: Icon, badge }) => (
        <NavLink
          key={label}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            cn(
              'flex items-center justify-center gap-4 rounded-full px-3 py-2.5 text-[0.9375rem] hover:bg-wash lg:justify-start',
              isActive && 'font-bold text-ink-strong',
            )
          }
        >
          {/* In the collapsed rail the count sits on the icon's corner; expanded, it follows the label. */}
          <span className="relative shrink-0">
            <Icon size={22} aria-hidden />
            <NavBadge count={badge} className="absolute -top-2 -right-3 lg:hidden" />
          </span>
          <span className="sr-only lg:not-sr-only">{label}</span>
          <NavBadge count={badge} className="hidden lg:inline-flex" />
        </NavLink>
      ))}

      <div className="mt-6 hidden lg:block">
        <BackendSwitcher />
      </div>

      <div className="mt-auto flex flex-col gap-1 pt-6">
        {me && (
          <div className="flex items-center justify-center gap-3 rounded-full px-2 py-2 lg:justify-start">
            <Avatar user={me} size="sm" />
            <div className="hidden min-w-0 flex-col lg:flex">
              <span className="truncate text-sm font-semibold">{me.displayName}</span>
              <span className="flex items-center gap-1.5 text-xs text-muted">
                <span
                  aria-hidden
                  className={cn(
                    'size-1.5 rounded-full',
                    state === 'open' ? 'bg-live' : state === 'idle' ? 'bg-line' : 'bg-safelight',
                  )}
                />
                {state === 'open' ? 'Live updates on' : state === 'idle' ? 'Live updates off' : 'Connecting…'}
              </span>
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}

function MobileNav() {
  const items = useNavItems().filter((i) => i.mobile)
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 flex h-16 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      {items.map(({ to, label, icon: Icon, badge }) => (
        <NavLink
          key={label}
          to={to}
          end={to === '/'}
          aria-label={label}
          className={({ isActive }) =>
            cn('relative flex flex-1 items-center justify-center text-muted', isActive && 'text-ink-strong')
          }
        >
          <Icon size={23} aria-hidden />
          {badge ? <span className="absolute top-3 left-1/2 ml-1.5 size-2 rounded-full bg-safelight" /> : null}
        </NavLink>
      ))}
    </nav>
  )
}

function Aside() {
  const navigate = useNavigate()
  return (
    <aside className="sticky top-0 hidden h-dvh flex-col gap-4 overflow-y-auto px-5 py-3 xl:flex">
      <SearchBox value="" onChange={(q) => navigate(`/explore?q=${encodeURIComponent(q)}`)} />
      <WhenLive op="listTrendingHashtags">
        <AsidePanel title="Trending">
          <TrendingList limit={5} />
        </AsidePanel>
      </WhenLive>
      <WhenLive op="listSuggestedUsers">
        <AsidePanel title="People to follow">
          <SuggestionList />
        </AsidePanel>
      </WhenLive>
    </aside>
  )
}

function AsidePanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface py-2">
      <h2 className="px-4 pt-1 pb-1 text-lg font-bold">{title}</h2>
      {children}
    </section>
  )
}

/** Three columns on desktop, one column plus a tab bar on phones. */
export function AppShell() {
  const backendId = useSession((s) => s.backendId)
  const { pathname } = useLocation()
  const wide = pathname.startsWith('/messages')

  return (
    <div data-backend={backendId} className="min-h-dvh">
      {/* A thin band in the active backend's hue, so you never forget which one is answering. */}
      <div
        className="fixed inset-x-0 top-0 z-50 h-0.5 bg-(--backend)"
        role="img"
        aria-label={`Connected to ${BACKENDS[backendId].name}`}
      />
      <div
        className={cn(
          'mx-auto grid max-w-[80rem] grid-cols-1 md:grid-cols-[5rem_1fr] lg:grid-cols-[16rem_1fr]',
          !wide && 'xl:grid-cols-[16rem_37.5rem_1fr]',
        )}
      >
        <SideNav />
        <main
          className={cn(
            'min-h-dvh min-w-0 border-line bg-surface pb-16 md:border-x md:pb-0',
            !wide && 'xl:max-w-[37.5rem]',
          )}
        >
          <Suspense fallback={<PageSpinner />}>
            <Outlet />
          </Suspense>
        </main>
        {!wide && <Aside />}
      </div>
      <MobileNav />
    </div>
  )
}

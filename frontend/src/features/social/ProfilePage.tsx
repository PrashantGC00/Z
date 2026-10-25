import { type FormEvent, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { BadgeCheck, CalendarDays, Link2, MapPin } from 'lucide-react'
import { ApiError } from '@/api/errors'
import type { components } from '@/api/schema'
import { Avatar } from '@/components/Avatar'
import { Dialog, DialogActions } from '@/components/Dialog'
import { EmptyState, ErrorState, InlineError, PageSpinner } from '@/components/feedback'
import { LoadMore } from '@/components/LoadMore'
import { Menu } from '@/components/Menu'
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { useMe, useUpdateProfile } from '@/features/auth/api'
import { useOperationLive } from '@/features/backends/useOperationLive'
import { useStartConversation } from '@/features/chat/api'
import { useUploads } from '@/features/media/upload'
import { ReportDialog } from '@/features/posts/PostDialogs'
import { PostList } from '@/features/posts/PostList'
import { PageHeader } from '@/features/shell/PageHeader'
import { cn } from '@/lib/cn'
import { formatCount, formatJoined, plural } from '@/lib/format'
import { useConnections, useProfile, useToggleBlock } from './api'
import { FollowButton } from './FollowButton'

type Profile = components['schemas']['UserProfile']
type Tab = 'posts' | 'followers' | 'following'

function EditProfileDialog({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const update = useUpdateProfile()
  const avatar = useUploads('avatar')
  const [form, setForm] = useState({
    displayName: profile.displayName,
    bio: profile.bio ?? '',
    location: profile.location ?? '',
    website: profile.website ?? '',
  })
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    update.mutate(
      {
        displayName: form.displayName.trim(),
        bio: form.bio.trim() || null,
        location: form.location.trim() || null,
        website: form.website.trim() || null,
        avatarMediaId: avatar.readyIds[0],
      },
      { onSuccess: onClose },
    )
  }
  const err = (field: string) => (update.error instanceof ApiError ? update.error.fieldError(field) : undefined)
  const preview = avatar.items[0]?.previewUrl

  return (
    <Dialog open onClose={onClose} title="Edit profile">
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <label className="flex cursor-pointer items-center gap-4">
          <Avatar user={{ displayName: form.displayName || '?', avatarUrl: preview ?? profile.avatarUrl }} size="lg" />
          <span className="text-sm font-medium text-ink">
            {avatar.busy ? 'Uploading…' : (avatar.items[0]?.error ?? 'Change photo')}
          </span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(e) => {
              avatar.reset()
              if (e.target.files?.[0]) avatar.add([e.target.files[0]])
            }}
          />
        </label>
        <Field label="Name" htmlFor="pf-name" error={err('displayName')}>
          <Input id="pf-name" value={form.displayName} onChange={set('displayName')} maxLength={60} required />
        </Field>
        <Field label="Bio" htmlFor="pf-bio" error={err('bio')} hint={`${300 - form.bio.length} characters left`}>
          <Textarea id="pf-bio" rows={3} value={form.bio} onChange={set('bio')} maxLength={300} />
        </Field>
        <Field label="Location" htmlFor="pf-location">
          <Input id="pf-location" value={form.location} onChange={set('location')} maxLength={60} />
        </Field>
        <Field label="Website" htmlFor="pf-website" error={err('website')}>
          <Input id="pf-website" type="url" placeholder="https://" value={form.website} onChange={set('website')} />
        </Field>
        <InlineError error={update.error} />
        <DialogActions>
          <Button variant="quiet" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={update.isPending || avatar.busy}>
            {update.isPending ? 'Saving…' : 'Save profile'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

function ProfileHeader({ profile }: { profile: Profile }) {
  const { data: me } = useMe()
  const navigate = useNavigate()
  const start = useStartConversation()
  const block = useToggleBlock()
  const canMessage = useOperationLive('createConversation')
  const [dialog, setDialog] = useState<'edit' | 'report' | null>(null)
  const isMe = me?.id === profile.id
  const rel = profile.relationship

  return (
    <section className="border-b border-line">
      <div className="aspect-[3/1] bg-wash">
        {profile.coverUrl && <img src={profile.coverUrl} alt="" className="size-full object-cover" />}
      </div>
      <div className="px-4 pb-4">
        <div className="-mt-14 flex items-end justify-between gap-3">
          <Avatar user={profile} size="xl" className="ring-4 ring-surface" />
          <div className="flex items-center gap-2 pb-1">
            {isMe ? (
              <Button variant="secondary" size="sm" onClick={() => setDialog('edit')}>
                Edit profile
              </Button>
            ) : rel?.blocking ? (
              <Button
                variant="danger"
                size="sm"
                onClick={() => block.mutate({ username: profile.username, blocking: true })}
              >
                Unblock
              </Button>
            ) : (
              <>
                <Menu
                  label="More options"
                  items={[
                    {
                      label: `Block @${profile.username}`,
                      tone: 'danger',
                      onSelect: () =>
                        confirm(`Block @${profile.username}? You will stop following each other.`) &&
                        block.mutate({ username: profile.username, blocking: false }),
                    },
                    { label: 'Report account', tone: 'danger', onSelect: () => setDialog('report') },
                  ]}
                />
                {canMessage && (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={start.isPending}
                    onClick={() =>
                      start.mutate(
                        { type: 'direct', memberIds: [profile.id] },
                        { onSuccess: (c) => navigate(`/messages/${c.id}`) },
                      )
                    }
                  >
                    Message
                  </Button>
                )}
                <FollowButton username={profile.username} following={Boolean(rel?.following)} />
              </>
            )}
          </div>
        </div>

        <h2 className="mt-3 flex items-center gap-1.5 text-2xl font-bold">
          {profile.displayName}
          {profile.verified && <BadgeCheck size={20} className="text-ink" aria-label="Verified" />}
        </h2>
        <p className="text-muted">
          @{profile.username}
          {rel?.followedBy && <span className="ml-2 rounded bg-wash px-1.5 py-0.5 text-xs">Follows you</span>}
        </p>
        {profile.bio && <p className="mt-3 whitespace-pre-wrap">{profile.bio}</p>}
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
          {profile.location && (
            <span className="flex items-center gap-1">
              <MapPin size={14} aria-hidden /> {profile.location}
            </span>
          )}
          {profile.website && (
            <a
              href={profile.website}
              target="_blank"
              rel="noreferrer noopener"
              className="flex items-center gap-1 text-ink hover:underline"
            >
              <Link2 size={14} aria-hidden /> {profile.website.replace(/^https?:\/\//, '')}
            </a>
          )}
          <span className="flex items-center gap-1">
            <CalendarDays size={14} aria-hidden /> {formatJoined(profile.createdAt)}
          </span>
        </p>
        <p className="mt-3 flex gap-5 text-sm">
          <Link to="?tab=following" className="hover:underline">
            <strong className="tabular-nums">{formatCount(profile.stats.following)}</strong>{' '}
            <span className="text-muted">Following</span>
          </Link>
          <Link to="?tab=followers" className="hover:underline">
            <strong className="tabular-nums">{formatCount(profile.stats.followers)}</strong>{' '}
            <span className="text-muted">{profile.stats.followers === 1 ? 'Follower' : 'Followers'}</span>
          </Link>
        </p>
      </div>
      {dialog === 'edit' && <EditProfileDialog profile={profile} onClose={() => setDialog(null)} />}
      {dialog === 'report' && <ReportDialog targetKind="user" targetId={profile.id} onClose={() => setDialog(null)} />}
    </section>
  )
}

function ConnectionList({ username, kind }: { username: string; kind: 'followers' | 'following' }) {
  const query = useConnections(username, kind)
  if (query.isPending) return <PageSpinner />
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  const users = query.data.pages.flatMap((p) => p.data)
  if (!users.length)
    return <EmptyState title={kind === 'followers' ? 'No followers yet' : 'Not following anyone yet'} />
  return (
    <ul>
      {users.map((u) => (
        <li key={u.id}>
          <Link
            to={`/u/${u.username}`}
            className="flex items-center gap-3 border-b border-line px-4 py-3 hover:bg-wash/60"
          >
            <Avatar user={u} />
            <span className="flex flex-col">
              <span className="font-semibold">{u.displayName}</span>
              <span className="text-sm text-muted">@{u.username}</span>
            </span>
          </Link>
        </li>
      ))}
      <LoadMore
        hasMore={query.hasNextPage}
        loading={query.isFetchingNextPage}
        onLoad={() => void query.fetchNextPage()}
      />
    </ul>
  )
}

const TABS: Array<[Tab, string]> = [
  ['posts', 'Posts'],
  ['followers', 'Followers'],
  ['following', 'Following'],
]

export function ProfilePage() {
  const { username = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab | null) ?? 'posts'
  const query = useProfile(username)

  return (
    <>
      <PageHeader
        back
        title={query.data?.displayName ?? `@${username}`}
        subtitle={query.data ? plural(query.data.stats.posts, 'post') : undefined}
      />
      {query.isPending ? (
        <PageSpinner />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <ProfileHeader profile={query.data} />
          <nav className="flex border-b border-line" aria-label="Profile sections">
            {TABS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-current={tab === value ? 'page' : undefined}
                onClick={() => setParams(value === 'posts' ? {} : { tab: value })}
                className={cn(
                  'flex-1 cursor-pointer border-b-2 border-transparent py-3 text-sm font-semibold text-muted hover:bg-wash/60',
                  tab === value && 'border-ink text-fg',
                )}
              >
                {label}
              </button>
            ))}
          </nav>
          {tab === 'posts' ? (
            <PostList
              source={{ kind: 'user', username }}
              empty={<EmptyState title="No posts yet">When @{username} posts, it will show up here.</EmptyState>}
            />
          ) : (
            <ConnectionList key={tab} username={username} kind={tab} />
          )}
        </>
      )}
    </>
  )
}

import { lazy } from 'react'

// Route-level code splitting: the feed and sign-in ship in the main bundle, everything else
// loads on first visit.
export const ChatPage = lazy(() => import('@/features/chat/ChatPage').then((m) => ({ default: m.ChatPage })))
export const ExplorePage = lazy(() => import('@/features/search/ExplorePage').then((m) => ({ default: m.ExplorePage })))
export const NotificationsPage = lazy(() =>
  import('@/features/notifications/NotificationsPage').then((m) => ({ default: m.NotificationsPage })),
)
export const ProfilePage = lazy(() => import('@/features/social/ProfilePage').then((m) => ({ default: m.ProfilePage })))
export const SettingsPage = lazy(() =>
  import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })),
)

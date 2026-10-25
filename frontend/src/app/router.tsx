import { createBrowserRouter } from 'react-router'
import { AuthPage } from '@/features/auth/AuthPage'
import { BookmarksPage, FeedPage, HashtagPage, PostPage } from '@/features/posts/pages'
import { AppShell } from '@/features/shell/AppShell'
import { EmptyState } from '@/components/feedback'
import { ChatPage, ExplorePage, NotificationsPage, ProfilePage, SettingsPage } from './lazyPages'
import { RequireAuth } from './RequireAuth'

export const router = createBrowserRouter([
  { path: '/login', element: <AuthPage mode="login" /> },
  { path: '/register', element: <AuthPage mode="register" /> },
  {
    element: <AppShell />,
    children: [
      {
        element: <RequireAuth />,
        children: [
          { index: true, element: <FeedPage /> },
          { path: '/explore', element: <ExplorePage /> },
          { path: '/tag/:tag', element: <HashtagPage /> },
          { path: '/p/:postId', element: <PostPage /> },
          { path: '/u/:username', element: <ProfilePage /> },
          { path: '/messages/:conversationId?', element: <ChatPage /> },
          { path: '/notifications', element: <NotificationsPage /> },
          { path: '/bookmarks', element: <BookmarksPage /> },
          { path: '/settings', element: <SettingsPage /> },
        ],
      },
      { path: '*', element: <EmptyState title="That page does not exist" /> },
    ],
  },
])

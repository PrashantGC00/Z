import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { useToggleFollow } from './api'

export function FollowButton({ username, following }: { username: string; following: boolean }) {
  const toggle = useToggleFollow()
  return (
    <Button
      variant={following ? 'secondary' : 'primary'}
      size="sm"
      disabled={toggle.isPending}
      onClick={() => toggle.mutate({ username, following })}
      className={cn(following && 'hover:border-danger hover:text-danger')}
    >
      {following ? 'Following' : 'Follow'}
    </Button>
  )
}

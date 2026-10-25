import { useNavigate } from 'react-router'
import { coverage } from '@/api/contract'
import { BACKEND_ORDER, BACKENDS, type BackendId } from '@/config/backends'
import { cn } from '@/lib/cn'
import { useSession } from '@/stores/session'
import { type HealthResult, switchBackend, useAllHealth } from './health'

function healthText(result: HealthResult | undefined) {
  if (!result) return 'Checking…'
  return result.up ? 'Responding' : 'Not running'
}

export function HealthDot({ result }: { result: HealthResult | undefined }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block size-1.5 rounded-full', !result ? 'bg-line' : result.up ? 'bg-live' : 'bg-offline')}
    />
  )
}

/** The one place the app admits it has four interchangeable backends. */
export function BackendSwitcher() {
  const backendId = useSession((s) => s.backendId)
  const health = useAllHealth()
  const navigate = useNavigate()

  const choose = (id: BackendId) => {
    if (id === backendId) return
    switchBackend(id)
    navigate('/')
  }

  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-2 px-3 text-xs font-medium text-muted">Backend</legend>
      {BACKEND_ORDER.map((id) => {
        const result = health[id]
        const { live, total } = coverage(id)
        return (
          <label
            key={id}
            data-backend={id}
            className={cn(
              'group relative flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-wash',
              'has-checked:bg-(--backend)/10 has-focus-visible:outline-2 has-focus-visible:outline-ink',
            )}
          >
            <input
              type="radio"
              name="backend"
              value={id}
              checked={id === backendId}
              onChange={() => choose(id)}
              className="sr-only"
            />
            {/* A square swatch that fills in when selected, in the backend's own hue. */}
            <span
              aria-hidden
              className="size-3 shrink-0 rounded-[3px] border-2 border-(--backend) group-has-checked:bg-(--backend)"
            />
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-semibold group-has-checked:text-(--backend)">
                {BACKENDS[id].name}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-muted">
                <HealthDot result={result} />
                {healthText(result)}
                {id !== 'mock' && (
                  <span className="tabular-nums">
                    <span aria-hidden>·</span> {live}/{total} live
                  </span>
                )}
              </span>
            </span>
          </label>
        )
      })}
    </fieldset>
  )
}

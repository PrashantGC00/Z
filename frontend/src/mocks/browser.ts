import { setupWorker } from 'msw/browser'
import { handlers } from './handlers'

export const worker = setupWorker(...handlers)

/** Only `/mock/*` is intercepted, so real backends are untouched while the worker runs. */
export function startMockBackend() {
  return worker.start({
    onUnhandledRequest: 'bypass',
    quiet: true,
  })
}

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import './styles/globals.css'

async function boot() {
  // The mock backend is a service worker that only answers /mock/*; it is harmless when a
  // real backend is selected, so it always runs and switching back to it needs no reload.
  const { startMockBackend } = await import('./mocks/browser')
  await startMockBackend()

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void boot()

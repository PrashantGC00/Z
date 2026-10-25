/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MONOLITH_URL?: string
  readonly VITE_MICROSERVICES_URL?: string
  readonly VITE_HYBRID_URL?: string
  readonly VITE_DEFAULT_BACKEND?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

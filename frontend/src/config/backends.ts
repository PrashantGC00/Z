import { ARCHITECTURE_IDS } from '@/api/contract.gen'

export type ArchitectureId = (typeof ARCHITECTURE_IDS)[number]
export type BackendId = ArchitectureId | 'mock'

export interface BackendTarget {
  id: BackendId
  name: string
  /** One line on what makes this architecture different. */
  tagline: string
  stack: string[]
  baseUrl: string
}

const env = import.meta.env

export const BACKENDS: Record<BackendId, BackendTarget> = {
  mock: {
    id: 'mock',
    name: 'In-browser mock',
    tagline: 'Mock Service Worker answers every operation from seeded in-memory data.',
    stack: ['MSW', 'TypeScript'],
    baseUrl: `${window.location.origin}/mock/v1`,
  },
  monolith: {
    id: 'monolith',
    name: 'Modular monolith',
    tagline: 'One Express app, one database, module boundaries enforced at build time.',
    stack: ['Express 5', 'TypeScript', 'PostgreSQL', 'Drizzle', 'Redis', 'BullMQ', 'MinIO'],
    baseUrl: env.VITE_MONOLITH_URL ?? 'http://localhost:8081/v1',
  },
  microservices: {
    id: 'microservices',
    name: 'Microservices',
    tagline: 'Independently deployed services in four languages.',
    stack: ['Express TS', 'Go Fiber', 'Rust Axum', 'FastAPI', 'gRPC', 'Redpanda', 'PostgreSQL', 'MongoDB'],
    baseUrl: env.VITE_MICROSERVICES_URL ?? 'http://localhost:8082/v1',
  },
  hybrid: {
    id: 'hybrid',
    name: 'Monolith + media service',
    tagline: 'The monolith with file uploads and compression split into their own service.',
    stack: ['Express 5', 'TypeScript', 'Media service'],
    baseUrl: env.VITE_HYBRID_URL ?? 'http://localhost:8083/v1',
  },
}

export const BACKEND_ORDER: BackendId[] = ['mock', ...ARCHITECTURE_IDS]

export function isBackendId(value: unknown): value is BackendId {
  return typeof value === 'string' && value in BACKENDS
}

export const DEFAULT_BACKEND: BackendId = isBackendId(env.VITE_DEFAULT_BACKEND) ? env.VITE_DEFAULT_BACKEND : 'mock'

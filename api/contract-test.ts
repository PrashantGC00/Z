/**
 * Contract tests for a running backend: Schemathesis generates requests from api/openapi.yaml
 * and checks every response against it.
 *
 *   pnpm test:contract <architecture>                 every operation marked LIVE for it
 *   pnpm test:contract <architecture> <operationId>…  just these, LIVE or not, so an operation
 *                                                     can be checked before it is flipped
 *
 * Env: CONTRACT_BASE_URL (default: the gateway port + /v1), CONTRACT_EMAIL / CONTRACT_PASSWORD
 * (default: the demo account). Needs `uvx` (https://docs.astral.sh/uv/) to run Schemathesis.
 */
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

const SPEC_PATH = fileURLToPath(new URL('./openapi.yaml', import.meta.url))
const PORTS: Record<string, number> = { monolith: 8081, microservices: 8082, hybrid: 8083 }
const METHODS = ['get', 'put', 'post', 'patch', 'delete']

interface Operation {
  operationId: string
  'x-status'?: Record<string, string>
}

interface Spec {
  paths: Record<string, Record<string, Operation>>
}

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

/** Any HTTP answer means the backend is up; only a failed fetch means it is not. */
async function reachable(baseUrl: string): Promise<boolean> {
  try {
    await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(3000) })
    return true
  } catch {
    return false
  }
}

/** Sign in so authenticated operations get past 401. Without a working login, test unauthenticated. */
async function accessToken(baseUrl: string): Promise<string | undefined> {
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: process.env.CONTRACT_EMAIL ?? 'test@test.com',
      password: process.env.CONTRACT_PASSWORD ?? 'testtest',
    }),
  }).catch(() => undefined)
  if (!res?.ok) return undefined
  const body = (await res.json()) as { tokens?: { accessToken?: string } }
  return body.tokens?.accessToken
}

const [architecture, ...requested] = process.argv.slice(2)
if (!architecture || !(architecture in PORTS)) {
  fail(`Usage: pnpm test:contract <${Object.keys(PORTS).join('|')}> [operationId...]`)
}

const spec = parse(await readFile(SPEC_PATH, 'utf8')) as Spec
const operations = Object.values(spec.paths).flatMap((item) =>
  METHODS.flatMap((m) => (item[m] ? [item[m]] : [])),
)

const unknown = requested.filter((id) => !operations.some((op) => op.operationId === id))
if (unknown.length) fail(`Not in api/openapi.yaml: ${unknown.join(', ')}`)

const ids = requested.length
  ? requested
  : operations.filter((op) => op['x-status']?.[architecture] === 'LIVE').map((op) => op.operationId)
if (!ids.length) {
  console.log(`No operation is LIVE on ${architecture} yet. Name operations to test them anyway:`)
  console.log(`  pnpm test:contract ${architecture} getHealth`)
  process.exit(0)
}

const baseUrl = process.env.CONTRACT_BASE_URL ?? `http://localhost:${PORTS[architecture]}/v1`
if (!(await reachable(baseUrl))) fail(`Could not reach ${architecture} at ${baseUrl}. Is it running?`)

const token = await accessToken(baseUrl)
if (!token) console.warn('Could not sign in, so operations that need auth will see 401s.\n')

console.log(`Testing ${ids.length} operation(s) on ${architecture} at ${baseUrl}\n`)
const args = [
  'schemathesis',
  'run',
  SPEC_PATH,
  '--url',
  baseUrl,
  '--checks',
  'all',
  ...ids.flatMap((id) => ['--include-operation-id', id]),
  ...(token ? ['--header', `Authorization: Bearer ${token}`] : []),
]
spawn('uvx', args, { stdio: 'inherit' })
  .on('error', () => fail('Could not start uvx. Install uv: https://docs.astral.sh/uv/'))
  .on('exit', (code) => process.exit(code ?? 1))

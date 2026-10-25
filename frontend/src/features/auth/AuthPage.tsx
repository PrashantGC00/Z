import { type FormEvent, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router'
import { ApiError } from '@/api/errors'
import { ErrorState } from '@/components/feedback'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { BACKENDS } from '@/config/backends'
import { DEMO_ACCOUNT } from '@/config/demo'
import { BackendSwitcher } from '@/features/backends/BackendSwitcher'
import { useOperationLive } from '@/features/backends/useOperationLive'
import { useIsSignedIn, useSession } from '@/stores/session'
import { useLogin, useRegister } from './api'

const fieldError = (error: unknown, field: string) => (error instanceof ApiError ? error.fieldError(field) : undefined)

function LoginForm() {
  const login = useLogin()
  const backendId = useSession((s) => s.backendId)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    login.mutate({ email, password })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label="Email" htmlFor="login-email">
        <Input
          id="login-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <Field label="Password" htmlFor="login-password">
        <Input
          id="login-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      {login.error && <ErrorState error={login.error} />}
      <Button type="submit" size="lg" disabled={login.isPending}>
        {login.isPending ? 'Signing in…' : 'Sign in'}
      </Button>
      {backendId === 'mock' && (
        <Button
          variant="quiet"
          onClick={() => {
            setEmail(DEMO_ACCOUNT.email)
            setPassword(DEMO_ACCOUNT.password)
            login.mutate(DEMO_ACCOUNT)
          }}
        >
          Use the demo account
        </Button>
      )}
    </form>
  )
}

function RegisterForm() {
  const register = useRegister()
  const [form, setForm] = useState({ displayName: '', username: '', email: '', password: '' })
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))
  const err = (field: string) => fieldError(register.error, field)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    register.mutate({ ...form, username: form.username.toLowerCase() })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label="Name" htmlFor="reg-name" error={err('displayName')}>
        <Input id="reg-name" autoComplete="name" required value={form.displayName} onChange={set('displayName')} />
      </Field>
      <Field
        label="Username"
        htmlFor="reg-username"
        error={err('username')}
        hint="Lowercase letters, numbers, dots and underscores."
      >
        <Input
          id="reg-username"
          autoComplete="username"
          required
          value={form.username}
          onChange={set('username')}
          aria-invalid={Boolean(err('username'))}
        />
      </Field>
      <Field label="Email" htmlFor="reg-email" error={err('email')}>
        <Input
          id="reg-email"
          type="email"
          autoComplete="email"
          required
          value={form.email}
          onChange={set('email')}
          aria-invalid={Boolean(err('email'))}
        />
      </Field>
      <Field label="Password" htmlFor="reg-password" error={err('password')} hint="At least 10 characters.">
        <Input
          id="reg-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          value={form.password}
          onChange={set('password')}
          aria-invalid={Boolean(err('password'))}
        />
      </Field>
      {register.error && !(register.error instanceof ApiError && register.error.problem.errors?.length) && (
        <ErrorState error={register.error} />
      )}
      <Button type="submit" size="lg" disabled={register.isPending}>
        {register.isPending ? 'Creating account…' : 'Create account'}
      </Button>
    </form>
  )
}

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const signedIn = useIsSignedIn()
  const location = useLocation()
  const backend = BACKENDS[useSession((s) => s.backendId)]
  const live = useOperationLive(mode === 'login' ? 'login' : 'register')
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  if (signedIn) return <Navigate to={from} replace />

  return (
    <main className="mx-auto grid min-h-dvh max-w-5xl gap-10 px-4 py-10 md:grid-cols-[1fr_22rem] md:items-center md:px-8">
      <section className="max-w-md">
        <h1 className="text-4xl font-bold tracking-tight text-ink-strong">Z</h1>
        <p className="mt-2 text-lg text-muted">Posts, photos, stories and chat with the people you follow.</p>

        <div className="mt-8 rounded-2xl border border-line bg-surface p-6">
          <h2 className="mb-5 text-xl font-semibold">{mode === 'login' ? 'Sign in' : 'Create your account'}</h2>
          {live ? (
            mode === 'login' ? (
              <LoginForm />
            ) : (
              <RegisterForm />
            )
          ) : (
            <p className="rounded-xl bg-wash p-4 text-sm text-muted">
              {mode === 'login' ? 'Sign-in' : 'Registration'} is not built on the {backend.name} backend yet. Pick
              another backend to keep going.
            </p>
          )}
          <p className="mt-5 text-center text-sm text-muted">
            {mode === 'login' ? (
              <>
                New here?{' '}
                <Link to="/register" className="font-medium text-ink hover:underline">
                  Create an account
                </Link>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <Link to="/login" className="font-medium text-ink hover:underline">
                  Sign in
                </Link>
              </>
            )}
          </p>
        </div>
      </section>
      <aside className="rounded-2xl border border-line bg-surface p-3">
        <BackendSwitcher />
        <p className="px-3 pt-3 pb-1 text-xs text-muted">
          Each backend keeps its own accounts. You stay signed in to each one separately.
        </p>
      </aside>
    </main>
  )
}

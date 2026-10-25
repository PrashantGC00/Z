import { Fragment } from 'react'
import { Link } from 'react-router'

const TOKEN = /(#\w+|@[a-z0-9_.]{3,30}|https?:\/\/[^\s]+)/gi
const linkClass = 'font-medium text-ink hover:underline underline-offset-2'

/** Turns hashtags, mentions and URLs in user text into links. Never renders HTML. */
export function RichText({ text }: { text: string }) {
  const parts = text.split(TOKEN)
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 0) return <Fragment key={i}>{part}</Fragment>
        if (part.startsWith('#')) {
          return (
            <Link key={i} to={`/tag/${part.slice(1).toLowerCase()}`} className={linkClass}>
              {part}
            </Link>
          )
        }
        if (part.startsWith('@')) {
          return (
            <Link key={i} to={`/u/${part.slice(1).toLowerCase()}`} className={linkClass}>
              {part}
            </Link>
          )
        }
        return (
          <a key={i} href={part} target="_blank" rel="noreferrer noopener" className={linkClass}>
            {part.replace(/^https?:\/\//, '')}
          </a>
        )
      })}
    </>
  )
}

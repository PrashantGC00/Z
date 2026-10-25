import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/api/client'
import { unwrap } from '@/api/errors'
import type { components } from '@/api/schema'

type S = components['schemas']
type Purpose = S['CreateUploadRequest']['purpose']
type ContentType = S['CreateUploadRequest']['contentType']

export const ACCEPTED_TYPES: ContentType[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm',
]

export interface UploadItem {
  key: string
  file: File
  previewUrl: string
  progress: number
  stage: 'uploading' | 'processing' | 'ready' | 'failed'
  media?: S['Media']
  error?: string
}

/** PUT straight to object storage with XHR, because fetch cannot report upload progress. */
function putWithProgress(
  upload: S['MediaUpload'],
  file: File,
  onProgress: (fraction: number) => void,
  signal: AbortSignal,
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    signal.addEventListener('abort', () => xhr.abort())
    xhr.onabort = () => reject(signal.reason)
    xhr.open(upload.method, upload.uploadUrl)
    Object.entries(upload.headers).forEach(([k, v]) => xhr.setRequestHeader(k, v))
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total)
    xhr.onload = () =>
      xhr.status < 300 ? resolve() : reject(new Error(`Storage rejected the upload (${xhr.status}).`))
    xhr.onerror = () => reject(new Error('Upload failed. Check your connection and try again.'))
    xhr.send(file)
  })
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(signal.reason)
    })
  })
}

async function waitUntilReady(mediaId: string, signal: AbortSignal): Promise<S['Media']> {
  for (let attempt = 0; attempt < 30; attempt++) {
    const media = unwrap(await api().GET('/media/{mediaId}', { params: { path: { mediaId } }, signal }))
    if (media.status === 'ready') return media
    if (media.status === 'failed') throw new Error('Processing failed for this file.')
    await sleep(Math.min(500 * 1.5 ** attempt, 4000), signal)
  }
  throw new Error('Processing is taking too long. Try again later.')
}

/**
 * The three-step upload every backend implements:
 * 1. POST /media/uploads → pre-signed URL   2. PUT bytes to storage   3. POST /media/{id}/complete
 * then poll until the processing worker marks it ready.
 */
export function useUploads(purpose: Purpose) {
  const [items, setItems] = useState<UploadItem[]>([])

  // One per upload still in flight, so removing it or closing the composer stops the work.
  const controllers = useRef(new Map<string, AbortController>())
  const abort = useCallback((key: string) => {
    controllers.current.get(key)?.abort()
    controllers.current.delete(key)
  }, [])

  // Preview blobs live until revoked, so release whatever is left when the composer unmounts.
  const latest = useRef(items)
  useEffect(() => {
    latest.current = items
  }, [items])
  useEffect(() => {
    const inFlight = controllers.current
    return () => {
      inFlight.forEach((c) => c.abort())
      inFlight.clear()
      latest.current.forEach((i) => URL.revokeObjectURL(i.previewUrl))
    }
  }, [])

  const patch = (key: string, next: Partial<UploadItem>) =>
    setItems((all) => all.map((i) => (i.key === key ? { ...i, ...next } : i)))

  const add = useCallback(
    (files: File[]) => {
      files.forEach(async (file) => {
        const key = crypto.randomUUID()
        const controller = new AbortController()
        const { signal } = controller
        controllers.current.set(key, controller)
        setItems((all) => [
          ...all,
          { key, file, previewUrl: URL.createObjectURL(file), progress: 0, stage: 'uploading' },
        ])
        try {
          if (!ACCEPTED_TYPES.includes(file.type as ContentType))
            throw new Error('Use JPEG, PNG, WebP, GIF, MP4 or WebM.')
          const upload = unwrap(
            await api().POST('/media/uploads', {
              params: { header: { 'Idempotency-Key': key } },
              body: { contentType: file.type as ContentType, sizeBytes: file.size, purpose, fileName: file.name },
              signal,
            }),
          )
          await putWithProgress(upload, file, (progress) => patch(key, { progress }), signal)
          patch(key, { stage: 'processing', progress: 1 })
          unwrap(
            await api().POST('/media/{mediaId}/complete', { params: { path: { mediaId: upload.mediaId } }, signal }),
          )
          const media = await waitUntilReady(upload.mediaId, signal)
          patch(key, { stage: 'ready', media })
        } catch (e) {
          // Removed or unmounted: the item is gone, so there is nothing to mark as failed.
          if (signal.aborted) return
          patch(key, { stage: 'failed', error: e instanceof Error ? e.message : 'Upload failed.' })
        } finally {
          controllers.current.delete(key)
        }
      })
    },
    [purpose],
  )

  const remove = useCallback(
    (key: string) => {
      abort(key)
      setItems((all) => {
        const item = all.find((i) => i.key === key)
        if (item) URL.revokeObjectURL(item.previewUrl)
        return all.filter((i) => i.key !== key)
      })
    },
    [abort],
  )

  const reset = useCallback(
    () =>
      setItems((all) => {
        all.forEach((i) => {
          abort(i.key)
          URL.revokeObjectURL(i.previewUrl)
        })
        return []
      }),
    [abort],
  )

  return {
    items,
    add,
    remove,
    reset,
    busy: items.some((i) => i.stage === 'uploading' || i.stage === 'processing'),
    readyIds: items.filter((i) => i.stage === 'ready').map((i) => i.media!.id),
  }
}

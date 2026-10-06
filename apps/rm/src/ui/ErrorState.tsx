import { RotateCw, WifiOff } from 'lucide-react'
import type { ReactNode } from 'react'
import { isApiError } from '../api/client.ts'
import { cn } from '../lib/cn.ts'
import { Button } from './Button.tsx'

/**
 * What the RM reads when a call fails: what did not load, why in plain words, and a retry.
 * Never a stack trace, never a status code on its own, never a spinner that stays forever.
 */
export function describeError(error: unknown): string {
  if (isApiError(error)) {
    // Before the code: a dead API behind the proxy arrives as a bare 5xx, and the icon beside
    // this sentence already says the server is not reachable.
    if (error.unreachable && error.code !== 'TIMEOUT') {
      return 'The console could not reach the server. Check the connection and try again.'
    }
    switch (error.code) {
      case 'NETWORK':
        return 'The console could not reach the server. Check the connection and try again.'
      case 'TIMEOUT':
        return 'The server took too long to answer. It may be busy; try again in a moment.'
      case 'FORBIDDEN':
        return 'This customer is not in your book, so the file stays closed.'
      case 'NOT_FOUND':
        return 'There is no record of this. It may have been removed.'
      case 'RATE_LIMITED':
        return 'Too many requests in a short time. Wait a few seconds and try again.'
      default:
        return error.status >= 500
          ? 'Something went wrong on the server. Nothing was changed; try again.'
          : error.message
    }
  }
  return 'Something went wrong. Nothing was changed; try again.'
}

export interface ErrorStateProps {
  /** What did not load: "The book did not load". */
  title: ReactNode
  error?: unknown
  /** Overrides the sentence derived from the error. */
  body?: ReactNode
  onRetry?: () => void
  retrying?: boolean
  size?: 'inline' | 'page'
  className?: string
}

export function ErrorState({
  title,
  error,
  body,
  onRetry,
  retrying = false,
  size = 'inline',
  className,
}: ErrorStateProps) {
  const unreachable = isApiError(error) && error.unreachable
  return (
    <div
      role="alert"
      className={cn(
        'mx-auto flex max-w-md flex-col items-center gap-2 text-center',
        size === 'page' ? 'py-20' : 'py-8',
        className,
      )}
    >
      {unreachable ? (
        <div
          aria-hidden
          className="mb-1 inline-flex size-9 items-center justify-center rounded-full bg-danger-soft text-danger"
        >
          <WifiOff className="size-4" />
        </div>
      ) : null}
      <p className={cn('text-ink', size === 'page' ? 'text-title' : 'text-heading')}>{title}</p>
      <p className="text-label-plain text-ink-soft">{body ?? describeError(error)}</p>
      {onRetry ? (
        <Button
          className="mt-2"
          size="sm"
          onClick={onRetry}
          loading={retrying}
          icon={<RotateCw aria-hidden />}
        >
          Try again
        </Button>
      ) : null}
    </div>
  )
}

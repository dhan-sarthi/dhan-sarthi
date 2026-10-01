import { Compass } from 'lucide-react'
import { Link } from 'react-router'
import { Button, EmptyState } from '../ui/index.ts'

export function NotFound() {
  return (
    <EmptyState
      size="page"
      icon={<Compass />}
      title="There is no page here"
      body="The link may be old, or the address mistyped. Today has your calls; Book has every customer."
      action={
        <Button asChild variant="primary">
          <Link to="/">Go to Today</Link>
        </Button>
      }
    />
  )
}

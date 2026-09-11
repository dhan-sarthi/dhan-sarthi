/**
 * Smart Jars — the list.
 *
 * SmartWealth's jar list, on this app's roadmap. `spec/screens/12-rebalancing/01` is where the
 * card actually lives — the Smart Jars video has no list at all, no progress bar and no status
 * anywhere in its 74 seconds — so the card came from there and the creation funnel came from
 * `04-smart-jars`, which is the two halves of the surface arriving from two videos.
 *
 * Three decisions worth knowing before reading the markup.
 *
 * **The jars are the route's pots, and the screen says so.** A customer who did not create the
 * buffer jar will ask why it is there, and "your statements put it in front of your goal" is a
 * better answer than a screen that lets them assume they made it. The stages that are *not* pots
 * stay on Plan; the list names them rather than dropping them silently.
 *
 * **The promo card is the reference's, minus the illustration.** `Create Another SmartJar` on a
 * cream card with a gold hairline maps onto `Card tint="clay"`, and the isometric artwork has no
 * IDBI counterpart — inventing one would be inventing a brand. The card is the copy and the CTA.
 *
 * **The empty state is designed, not observed.** The source has none, anywhere; its own brief
 * says so. Ours says what is true when the list is empty, which is not "no goals" — this app
 * always has a goal — but "nothing on your route accumulates yet", and that has a reason worth
 * printing.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Plus } from 'lucide-react'
import type { View } from '@dhan/contracts'
import { Screen } from '../../components/Screen.tsx'
import type { ScreenChrome } from '../../components/Screen.tsx'
import { Sheet } from '../../components/Sheet.tsx'
import { Button, Card, Eyebrow, Head } from '../../components/ui.tsx'
import { CreateJar } from './CreateJar.tsx'
import { JarCard } from './JarCard.tsx'
import { JarDetail } from './JarDetail.tsx'
import { jars, nonJarStages, statusLabel } from './jar.ts'
import type { Jar } from './jar.ts'

const MEANING = {
  reached: 'The pot has as much in it as the target asks for. Nothing further is needed here.',
  on_track:
    'Money is going in and, at the present pace, this reaches its target on the date shown.',
  queued:
    'Nothing is going in yet. The jar ahead of it has the surplus until it is finished — the route runs one at a time on purpose, because splitting a small surplus four ways finishes none of them.',
  attention:
    'This will not reach its target at the present pace. Nothing has gone wrong; the plan is telling you the arithmetic rather than moving the number until it fits.',
} as const

export function SmartJars({
  view,
  chrome,
  onRefresh,
  onSaved,
  onOpenProfile,
  onOpenPlan,
}: {
  view: View
  /**
   * Given, this renders as a pane of another screen and draws that screen's bar and tab row —
   * the shape `Dashboard`'s four panes take. Left out, it is a screen of its own.
   */
  chrome?: ScreenChrome | undefined
  onRefresh?: (() => Promise<void>) | undefined
  /** A saved target: the shell announces it and re-reads the view. */
  onSaved: (message: string) => void
  onOpenProfile?: (() => void) | undefined
  /** The whole route, including the stages that are not pots. */
  onOpenPlan?: (() => void) | undefined
}): ReactNode {
  const [page, setPage] = useState<'list' | 'create'>('list')
  const [openJar, setOpenJar] = useState<Jar | null>(null)
  const [explaining, setExplaining] = useState<Jar | null>(null)

  const list = jars(view.roadmap, view.snapshot)
  const others = nonJarStages(view.roadmap)

  if (page === 'create') {
    return (
      <CreateJar
        snapshot={view.snapshot}
        roadmap={view.roadmap}
        asOf={view.meta.asOf}
        onBack={() => setPage('list')}
        onSaved={onSaved}
        onOpenProfile={onOpenProfile}
      />
    )
  }

  if (openJar) {
    /* Re-read from the fresh list rather than the captured object: a saved target re-cuts the
       roadmap under this screen, and a detail page still showing the old figures is a lie with a
       back button. */
    const live = list.find((j) => j.id === openJar.id) ?? openJar
    return (
      <JarDetail
        jar={live}
        roadmap={view.roadmap}
        snapshot={view.snapshot}
        asOf={view.meta.asOf}
        onBack={() => setOpenJar(null)}
        onEditTarget={
          live.isGoal
            ? () => {
                setOpenJar(null)
                setPage('create')
              }
            : undefined
        }
      />
    )
  }

  const header = chrome?.header ?? (
    <Head
      title="Smart Jars"
      sub={
        list.length === 0
          ? 'Goal-based saving'
          : `${list.length} ${list.length === 1 ? 'jar' : 'jars'} on your route`
      }
    />
  )

  return (
    <Screen
      header={header}
      notice={chrome?.notice}
      tabs={chrome?.tabs}
      {...(onRefresh ? { onRefresh } : {})}
      after={
        <Sheet
          open={explaining !== null}
          onClose={() => setExplaining(null)}
          title={explaining ? statusLabel(explaining.status) : ''}
          {...(explaining ? { sub: explaining.name } : {})}
        >
          {explaining ? (
            <div className="pt-1">
              <p className="m-0 text-[15px] leading-relaxed text-ink">
                {MEANING[explaining.status]}
              </p>
              <Eyebrow>Why this jar is on your route</Eyebrow>
              <p className="mb-1 mt-0 text-[14px] leading-relaxed text-ink-mid">
                {explaining.stage.why}
              </p>
            </div>
          ) : null}
        </Sheet>
      }
    >
      {list.length === 0 ? (
        <Empty goal={view.roadmap.goal.purpose ?? 'your goal'} onCreate={() => setPage('create')} />
      ) : (
        <div className="mt-3">
          {list.map((jar) => (
            <JarCard
              key={jar.id}
              jar={jar}
              onOpen={() => setOpenJar(jar)}
              onInfo={() => setExplaining(jar)}
            />
          ))}
        </div>
      )}

      {/* The reference's cream `Create Another SmartJar` card, once there is another to create. */}
      {list.length > 0 ? (
        <Card tint="clay">
          <h2>Set a new target</h2>
          {/* Not "your target today is ₹X". Where the plan aims at a floor before the goal, the
              goal's own figure and the goal *stage*'s target are two different numbers, and
              quoting one beside a card showing the other reads as an error. The purpose does not
              have that problem. */}
          <p className="m-0 mt-1.5 text-[13.5px] leading-relaxed text-ink-mid">
            Name what you are saving for, say when you want it, and see what it costs a month before
            you commit to anything. Today it is “{view.roadmap.goal.purpose ?? 'your goal'}”.
          </p>
          <div className="mt-4">
            <Button onClick={() => setPage('create')}>
              <Plus size={16} strokeWidth={2.6} />
              Create a jar
            </Button>
          </div>
        </Card>
      ) : null}

      {others.length > 0 ? (
        <Card>
          <h2>
            {others.length} more {others.length === 1 ? 'step' : 'steps'} on your route
          </h2>
          <p className="m-0 mt-1.5 text-[13.5px] leading-relaxed text-ink-mid">
            Things you do rather than pots you fill, so nothing here has a bar to draw. The whole
            route, in order, is on Plan.
          </p>
          <ul className="m-0 mt-3 list-none p-0">
            {others.map((s) => (
              <li
                key={s.index}
                className="flex gap-2.5 py-1 text-[13.5px] leading-snug text-ink-mid"
              >
                <span
                  aria-hidden="true"
                  className="mt-[7px] size-1.5 flex-none rounded-pill bg-brand"
                />
                <span className="min-w-0">{s.label}</span>
              </li>
            ))}
          </ul>
          {onOpenPlan ? (
            <div className="mt-4">
              <Button tone="secondary" size="sm" onClick={onOpenPlan}>
                See the route
              </Button>
            </div>
          ) : null}
        </Card>
      ) : null}
    </Screen>
  )
}

/**
 * No pots on the route.
 *
 * Rare and real: it happens when the buffer is already full, there is no expensive debt, and the
 * goal stage did not get built because a prerequisite *is* the goal — a customer whose stated
 * goal is clearing a card they have already cleared. Saying "you have no goals" there would be
 * false; the app always has one. So it says what is actually true and offers the one action that
 * changes it.
 */
function Empty({ goal, onCreate }: { goal: string; onCreate: () => void }): ReactNode {
  return (
    <div className="mt-3">
      <Card tint="sky">
        <h2>Nothing to fill yet</h2>
        <p className="m-0 mt-2 text-[14px] leading-relaxed text-ink-mid">
          A jar is a pot on your route with a number on it. Right now your route has none — either
          the buffer is already where it needs to be, or there is nothing spare each month for the
          plan to commit, so it has not opened one.
        </p>
        <p className="m-0 mt-3 text-[14px] leading-relaxed text-ink-mid">
          Your goal is still {goal}. Set a target and a date and the plan will open the jar for it.
        </p>
        <div className="mt-4">
          <Button onClick={onCreate}>
            <Plus size={16} strokeWidth={2.6} />
            Create a jar
          </Button>
        </div>
      </Card>
    </div>
  )
}

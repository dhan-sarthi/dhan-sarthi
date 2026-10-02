import { lazy, Suspense, type ComponentProps } from 'react'
import type { AreaChart } from '../../ui/index.ts'

const Chart = lazy(() => import('./areaChart.ts'))

/** Starts the chart library on its way before a chart is asked for: a hover on "Show chart". */
export function preloadAreaChart(): void {
  void import('./areaChart.ts')
}

/**
 * The kit's `AreaChart`, loaded when it is first drawn. The Book opens on its list with the band's
 * chart folded and the rail shut, so its first paint needs none of the chart library (about 110 kB
 * gzipped); the library arrives when the RM unfolds the chart or opens a row. Until then the
 * chart's box holds its height, so nothing under it moves when the lines arrive.
 */
export function LazyAreaChart(props: ComponentProps<typeof AreaChart>) {
  return (
    <Suspense
      fallback={
        <div aria-hidden className={props.className} style={{ height: props.height ?? 220 }} />
      }
    >
      <Chart {...props} />
    </Suspense>
  )
}

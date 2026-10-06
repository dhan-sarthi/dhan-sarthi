/**
 * The kit's `AreaChart` as a module of its own, so the Book can load it with `React.lazy`
 * (`LazyAreaChart.tsx`): importing it here, rather than in the band or the rail, keeps the chart
 * library out of the Book's own chunk until a chart is on screen.
 */
import { AreaChart } from '../../ui/index.ts'

export default AreaChart

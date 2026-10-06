/*
 * The console's component kit. Pages import from here and nowhere else in `ui/`, so a component
 * can be split or renamed without touching a page. `/kit` (dev only) renders every one of them,
 * and `scripts/check-kit.mjs` fails the build on an export no page uses: a page that needs
 * something the kit cannot do yet extends the kit rather than forking it. (`Toaster` is not
 * here: `App.tsx` loads it on its own, so the toast library stays out of the first chunk.)
 */
export { AllocationBar, ALLOCATION_PARTS } from './AllocationBar.tsx'
export { Avatar } from './Avatar.tsx'
export { Button } from './Button.tsx'
export { Card, CardDivider, CardFooter, CardHeader } from './Card.tsx'
export {
  AreaChart,
  PROJECTION_SWATCH,
  ProjectionChart,
  scenarioRoles,
  type BandDatum,
  type ScenarioRoles,
  type SeriesDef,
  type ValueFormat,
} from './charts.tsx'
export { Chip, type ChipTone } from './Chip.tsx'
export {
  CommandPalette,
  useCommandShortcut,
  type CommandGroupDef,
  type CommandItemDef,
} from './CommandPalette.tsx'
export { columnHeaderClass } from './columnHeader.ts'
export { DataTable, type RowFocusCause } from './DataTable.tsx'
export { DeltaPill } from './DeltaPill.tsx'
export {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  restoreFocus,
  useOpenerFocus,
} from './Dialog.tsx'
export { EmptyState } from './EmptyState.tsx'
export { ErrorState, describeError } from './ErrorState.tsx'
export { Field, Input, Select, Textarea } from './Field.tsx'
export { IconButton } from './IconButton.tsx'
export { InteractiveRow, useBadgeTabIndex } from './interactive-row.tsx'
export { Kbd, modKey } from './Kbd.tsx'
export { PageHeader, PropertyList, type Property } from './Layout.tsx'
export { MaskedField } from './MaskedField.tsx'
export { Money } from './Money.tsx'
export {
  MonthColumns,
  MonthLines,
  type MonthFormat,
  type MonthLine,
  type MonthColumnsProps,
  type MonthLinesProps,
} from './MonthChart.tsx'
export { AiLabel, Disclaimer, VerifiedBadge } from './Notices.tsx'
export {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from './Popover.tsx'
export { RankedBars, type RankedBarRow, type RankedBarsProps } from './RankedBars.tsx'
export { SectionLabel } from './SectionLabel.tsx'
export { SegmentTabs, type SegmentTab } from './SegmentTabs.tsx'
export { SideRail, SplitView, useRailOverlay, type SplitMode } from './SideRail.tsx'
export { LoadingRegion, Skeleton, SkeletonStat, SkeletonText } from './Skeleton.tsx'
export { Sparkline } from './Sparkline.tsx'
export { StackedBar, type StackedPart } from './StackedBar.tsx'
export { Stat } from './Stat.tsx'
export {
  HEALTH,
  HealthDot,
  SEGMENT,
  SEGMENT_ORDER,
  SEVERITY,
  SegmentBadge,
  SeverityChip,
  SeverityMark,
  StrengthBadge,
  type SegmentStyle,
  type SeverityStyle,
} from './status.tsx'
export { LinkTabs, Tabs, TabsContent, TabsList, TabsTrigger, type LinkTab } from './Tabs.tsx'
export {
  EVENT_ICON,
  TimelineDiff,
  TimelineEvent,
  TimelineMonth,
  type DiffRow,
} from './Timeline.tsx'
export { toast } from './toast.ts'
export { ToggleGroup, type ToggleOption } from './ToggleGroup.tsx'
export { Tooltip, TooltipProvider } from './Tooltip.tsx'

/*
 * The console's component kit. Pages import from here and nowhere else in `ui/`, so a component
 * can be split or renamed without touching a page. `/kit` (dev only) renders every one of them.
 */
export { AllocationBar, ALLOCATION_PARTS } from './AllocationBar.tsx'
export { Avatar } from './Avatar.tsx'
export { Button, buttonVariants } from './Button.tsx'
export { Card, CardDivider, CardFooter, CardHeader } from './Card.tsx'
export {
  AreaChart,
  BarChart,
  ChartTooltipCard,
  Donut,
  SmallMultiple,
  formatValue,
  type DonutSlice,
  type SeriesDef,
  type ValueFormat,
} from './charts.tsx'
export { Chip, chipVariants, type ChipTone } from './Chip.tsx'
export {
  CommandPalette,
  useCommandShortcut,
  type CommandGroupDef,
  type CommandItemDef,
} from './CommandPalette.tsx'
export { CellStack, DataTable } from './DataTable.tsx'
export { DeltaPill } from './DeltaPill.tsx'
export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTrigger,
} from './Dialog.tsx'
export { EmptyState } from './EmptyState.tsx'
export { ErrorState, describeError } from './ErrorState.tsx'
export { Field, Input, Select, Textarea } from './Field.tsx'
export { IconButton } from './IconButton.tsx'
export { Kbd, modKey } from './Kbd.tsx'
export { PageHeader, PropertyList, type Property } from './Layout.tsx'
export { MaskedField } from './MaskedField.tsx'
export { Money } from './Money.tsx'
export { AiLabel, Disclaimer, VerifiedBadge } from './Notices.tsx'
export {
  Popover,
  PopoverAnchor,
  PopoverClose,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from './Popover.tsx'
export { SectionLabel } from './SectionLabel.tsx'
export { SegmentTabs, type SegmentTab } from './SegmentTabs.tsx'
export { SideRail, SplitView } from './SideRail.tsx'
export { LoadingRegion, Skeleton, SkeletonStat, SkeletonText } from './Skeleton.tsx'
export { Sparkline } from './Sparkline.tsx'
export { Stat } from './Stat.tsx'
export {
  HEALTH,
  HealthDot,
  SEGMENT,
  SEVERITY,
  SEVERITY_ICON,
  SegmentBadge,
  SeverityChip,
  StrengthBadge,
} from './status.tsx'
export { LinkTabs, Tabs, TabsContent, TabsList, TabsTrigger, type LinkTab } from './Tabs.tsx'
export {
  EVENT_ICON,
  SOURCE_LABEL,
  TimelineDiff,
  TimelineEvent,
  TimelineMonth,
  UdayMark,
  type DiffRow,
} from './Timeline.tsx'
export { Toaster, toast } from './Toaster.tsx'
export { Tooltip, TooltipContent, TooltipProvider } from './Tooltip.tsx'

import { CircleCheck, Clock, Flame, Hourglass, type LucideIcon } from 'lucide-react'

/** What a reminder is doing, as the user sees it (not the database status). */
export type ReminderStatusKind = 'waiting' | 'nagging' | 'overdue' | 'done'

export const statusLabel: Record<ReminderStatusKind, string> = {
  waiting: 'Waiting',
  nagging: 'Nagging',
  overdue: 'Overdue',
  done: 'Done',
}

export const isStatusKind = (value: unknown): value is ReminderStatusKind =>
  // hasOwn, not `in`: `in` also accepts names every object has (?show=constructor).
  typeof value === 'string' && Object.hasOwn(statusLabel, value)

/** The same icons as the status tiles. */
export const statusIcon: Record<ReminderStatusKind, LucideIcon> = {
  waiting: Hourglass,
  nagging: Flame,
  overdue: Clock,
  done: CircleCheck,
}

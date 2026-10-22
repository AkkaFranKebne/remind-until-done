import { Field } from '@base-ui/react/field'
import { useState } from 'react'
import { ChipGroup } from '../../components/ui/ChipGroup'
import { useMe } from '../auth/useMe'
import { intervalOptions } from '../reminders/addReminderForm'
import { useSavePreferences } from './useSavePreferences'

/**
 * Settings → Preferences: the defaults new reminders start with, and the time zone (set from the
 * phone, design doc 5.6). Design doc 5.2 Settings, decision 47; Design Inventory → Phone Screens
 * → Settings ("Default"), Components → "IntervalChips".
 */
export function PreferencesSection() {
  const me = useMe()
  const save = useSavePreferences()
  if (!me) return null

  const interval = String(me.defaultNagIntervalMin)
  return (
    <section aria-labelledby="preferences">
      <h2
        id="preferences"
        className="border-b border-border px-1 pb-2 text-xs font-semibold tracking-wider text-fg2 uppercase"
      >
        Preferences
      </h2>
      <p className="px-1 pt-3 text-sm text-fg2">
        For new reminders. The ones you have keep theirs.
      </p>
      <div className="border-b border-border px-1 py-3.5">
        <ChipGroup
          legend="Default nag interval"
          options={intervalOptions}
          value={intervalOptions.some((o) => o.value === interval) ? interval : null}
          onChange={(v) => save.mutate({ defaultNagIntervalMin: Number(v) })}
        />
      </div>
      {/* key: a saved (or refused) time starts the field over from the new value. */}
      <DefaultTime
        key={me.defaultTimeOfDay}
        saved={me.defaultTimeOfDay}
        onSave={(t) => save.mutate({ defaultTimeOfDay: t })}
      />
      <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border px-1 py-3.5">
        <span className="shrink-0 text-base">Time zone</span>
        <span className="min-w-0 truncate text-sm text-fg2">{me.timezone}</span>
      </div>
    </section>
  )
}

/**
 * The time "Tomorrow 09:00" uses. The phone's own time picker (a real time field: iPhone shows
 * its wheel, Android its clock). Saved when the picker closes (blur), not on every turn of the
 * wheel; an empty or unchanged time isn't sent.
 */
function DefaultTime({ saved, onSave }: { saved: string; onSave: (time: string) => void }) {
  const [draft, setDraft] = useState(saved)
  return (
    <Field.Root className="flex min-h-11 items-center justify-between gap-3 border-b border-border px-1 py-2.5">
      <Field.Label className="text-base">Default time</Field.Label>
      <Field.Control
        type="time"
        value={draft}
        onChange={(e) => setDraft(e.currentTarget.value)}
        onBlur={() => {
          if (draft === '') setDraft(saved)
          else if (draft !== saved) onSave(draft)
        }}
        className="min-h-11 rounded-md bg-bg3 px-3 text-input text-fg focus-visible:outline-2 focus-visible:outline-accent"
      />
    </Field.Root>
  )
}

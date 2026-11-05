package dispatch

import "context"

// retention is design doc 7.4: how long data stays. Deleting a reminder takes its events along.
//
// A device is kept while its user still has a push to come, however long ago the app was opened
// (decision 77): last_seen_at only moves when the app starts, a reminder can be a year ahead, and
// without a device it would stop unseen. FCM answers for a token that really expired: the send
// finds it gone, and deletes it.
var retention = []struct{ table, query string }{
	{"reminders", `DELETE FROM reminders WHERE status = 'done' AND done_at < now() - interval '180 days'`},
	{"reminder_events", `DELETE FROM reminder_events WHERE created_at < now() - interval '90 days'`},
	{"push_subscriptions", `DELETE FROM push_subscriptions p
		WHERE p.last_seen_at < now() - interval '270 days'
		  AND NOT EXISTS (SELECT 1 FROM reminders r WHERE r.user_id = p.user_id
		    AND (r.status IN ('pending', 'sending') OR r.next_nag_at IS NOT NULL))`},
}

// deleteOld runs last in the sweep. A failure only counts and logs: it isn't urgent, the next
// sweep does it, and an error answer would make Scheduler repeat the repairs. Each cleanup is
// one statement, so it either happens or doesn't, and they don't depend on each other.
func (d *Dispatcher) deleteOld(ctx context.Context, stats *SweepStats) {
	for _, r := range retention {
		if ctx.Err() != nil {
			return
		}
		tag, err := d.pool.Exec(ctx, r.query)
		if err != nil {
			stats.Failed++
			d.log.WarnContext(ctx, "sweep: cleanup failed", "table", r.table, "err", err)
			continue
		}
		stats.Deleted += int(tag.RowsAffected())
	}
}

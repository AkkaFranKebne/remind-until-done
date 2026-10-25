/**
 * Closes a reminder's notification in the tray once it no longer applies (Done, deleted, or moved
 * to a new time), so an old nag doesn't stay there (design doc 5.8). Its pushes use the reminder's
 * id as tag. Best effort: not every browser lists shown notifications, and the next nag would
 * replace it anyway.
 */
export async function closeNotificationsOf(reminderId: string) {
  if (!('serviceWorker' in navigator)) return
  try {
    const registration = await navigator.serviceWorker.getRegistration()
    const shown = (await registration?.getNotifications({ tag: reminderId })) ?? []
    for (const notification of shown) notification.close()
  } catch {
    // Not supported here: nothing to do.
  }
}

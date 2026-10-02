/** Delete retired browser preferences without depending on their saved values. */
export function clearRetiredPreferences(storage?: Pick<Storage, "removeItem">) {
  try {
    (storage ?? window.localStorage).removeItem("kingdom-chronicle-view-mode");
  } catch {
    // Storage may be unavailable; retired values are never read by the app.
  }
}

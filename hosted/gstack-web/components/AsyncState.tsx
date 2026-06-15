/** Renders a clear loading / error card for an authenticated data section so a
 * slow or failed fetch doesn't silently fall through to a misleading "empty"
 * state. The #1 case: an expired/again-signed-out session 401s the broker —
 * the user should see "session may have expired", not "No calls yet".
 *
 * Returns null when there's nothing to show (data is ready) — the caller then
 * renders the real content. Usage:
 *
 *   {(isLoading || error)
 *     ? <AsyncState loading={isLoading} error={error} loadingText="Loading…" />
 *     : items.length === 0 ? <Empty/> : <Table/>}
 */
export function AsyncState({
  loading, error, loadingText = "Loading…",
}: { loading: boolean; error: unknown; loadingText?: string }) {
  if (error) {
    const status = (error as { status?: number })?.status;
    const msg = status === 401 || status === 403
      ? "Your session may have expired. Refresh the page, or sign out and back in."
      : "Couldn't reach the broker. Refresh and try again in a moment.";
    return (
      <div className="surface p-12 text-center anim-up">
        <div className="text-[14px] font-medium text-[var(--color-bad)]">Couldn't load</div>
        <div className="text-[12.5px] text-[var(--color-muted)] mt-2 max-w-sm mx-auto">{msg}</div>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="surface p-12 text-center anim-up">
        <span className="dot dot-mute pulse inline-block mr-2 align-middle" />
        <span className="text-[13px] text-[var(--color-muted)] align-middle">{loadingText}</span>
      </div>
    );
  }
  return null;
}

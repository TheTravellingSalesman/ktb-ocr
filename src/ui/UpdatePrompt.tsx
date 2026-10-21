import { useRegisterSW } from "virtual:pwa-register/preact";

/** How often an open app checks the hosting site for a newer version */
const UPDATE_CHECK_MS = 30 * 60 * 1000;

/**
 * Banner offering a reload when a newer app version has been published.
 *
 * The service worker caches the app so it works offline. A new deploy is
 * downloaded in the background and waits until staff choose to reload, so a
 * half-reviewed card is never swapped out from under them.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      // Exposed so e2e tests can trigger a check without waiting for the timer
      (window as unknown as { __checkForUpdate: () => Promise<void> }).__checkForUpdate = () =>
        registration.update().then(() => undefined);
      setInterval(() => registration.update(), UPDATE_CHECK_MS);
    },
  });

  if (!needRefresh) return null;
  return (
    <div class="banner banner-info" role="status">
      A new version of the app is available. Your work is saved.
      <button onClick={() => updateServiceWorker(true)}>Reload now</button>
    </div>
  );
}

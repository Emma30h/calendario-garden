export const BIRTHDAYS_BROADCAST_EVENT = "birthdays-updated";
const BIRTHDAYS_STORAGE_KEY = "calendario-garden:birthdays-updated-at";

export function dispatchBirthdaysUpdated() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(BIRTHDAYS_BROADCAST_EVENT));

  try {
    window.localStorage.setItem(BIRTHDAYS_STORAGE_KEY, String(Date.now()));
  } catch {
    // Ignore storage failures (for example private mode restrictions).
  }
}

export function subscribeToBirthdaysUpdates(onUpdated: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key === BIRTHDAYS_STORAGE_KEY) {
      onUpdated();
    }
  };

  window.addEventListener(BIRTHDAYS_BROADCAST_EVENT, onUpdated);
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener(BIRTHDAYS_BROADCAST_EVENT, onUpdated);
    window.removeEventListener("storage", onStorage);
  };
}

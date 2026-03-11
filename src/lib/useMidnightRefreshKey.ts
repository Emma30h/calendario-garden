"use client";

import { useEffect, useMemo, useState } from "react";

const MIN_TIMEOUT_MS = 1_000;

function getMillisecondsUntilNextMidnight() {
  const now = new Date();
  const nextMidnight = new Date(now);
  nextMidnight.setHours(24, 0, 0, 0);
  return Math.max(MIN_TIMEOUT_MS, nextMidnight.getTime() - now.getTime());
}

function buildCurrentDateForRefresh(refreshKey: number) {
  if (refreshKey < 0) {
    return new Date(0);
  }

  return new Date();
}

export function useMidnightRefreshKey() {
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let timeoutId: number | null = null;

    const scheduleNextTick = () => {
      timeoutId = window.setTimeout(() => {
        setRefreshKey((previous) => previous + 1);
        scheduleNextTick();
      }, getMillisecondsUntilNextMidnight());
    };

    scheduleNextTick();

    return () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  return refreshKey;
}

export function useCurrentDateAtMidnightRefresh() {
  const refreshKey = useMidnightRefreshKey();
  return useMemo(() => buildCurrentDateForRefresh(refreshKey), [refreshKey]);
}

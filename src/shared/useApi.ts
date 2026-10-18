import { useCallback, useEffect, useState } from "react";

/** GET 한 번 불러오기. reload()로 다시, setData()로 로컬 갱신. */
export function useApi<T>(load: (signal: AbortSignal) => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(load, deps);
  useEffect(() => {
    const ctl = new AbortController();
    setLoading(true);
    setError(null);
    run(ctl.signal)
      .then((d) => setData(d))
      .catch((e) => {
        if (!ctl.signal.aborted) setError(e instanceof Error ? e : new Error(String(e)));
      })
      .finally(() => {
        if (!ctl.signal.aborted) setLoading(false);
      });
    return () => ctl.abort();
  }, [run, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload, setData };
}

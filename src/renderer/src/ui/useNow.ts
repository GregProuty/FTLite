// Wall-clock time for text that counts seconds (React UI spec §2): a re-render at each wall-clock time t with
// t = phaseMs (mod periodMs), so the shown second changes exactly when the underlying value crosses a whole second.
import { useEffect, useState } from 'react';

export function useNow(periodMs = 1000, phaseMs = 0): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const arm = (): void => {
      const delay = ((((phaseMs - Date.now()) % periodMs) + periodMs) % periodMs) || periodMs;
      timer = setTimeout(() => { setNow(Date.now()); arm(); }, delay);
    };
    arm();
    return () => clearTimeout(timer);
  }, [periodMs, phaseMs]);
  return now;
}

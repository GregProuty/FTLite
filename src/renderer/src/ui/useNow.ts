// Wall-clock time for text that counts seconds (React UI spec §2): one re-render on each period boundary, so the shown
// second changes when the real one does.
import { useEffect, useState } from 'react';

export function useNow(periodMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const arm = (): void => { timer = setTimeout(() => { setNow(Date.now()); arm(); }, periodMs - (Date.now() % periodMs)); };
    arm();
    return () => clearTimeout(timer);
  }, [periodMs]);
  return now;
}

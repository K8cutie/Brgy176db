// ═══════════════════════════════════════════════════════════
// usePersistedState — a drop-in replacement for useState whose
// value is persisted to per-parish namespaced localStorage.
//
//   const [families, setFamilies] = usePersistedState(KEYS.families, SEED);
//
// On first mount it reads the stored value (falling back to the
// provided default), and it write-throughs to storage on every
// change. If a write fails (quota exceeded), onWriteError fires so
// the UI can warn the user instead of silently losing data.
// ═══════════════════════════════════════════════════════════

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { getJSON, setJSON } from '@/lib/storageNamespaced';

let globalWriteErrorHandler: ((key: string) => void) | null = null;

/** Register a global handler invoked whenever a persisted write fails. */
export function setPersistedWriteErrorHandler(fn: ((key: string) => void) | null) {
  globalWriteErrorHandler = fn;
}

export function usePersistedState<T>(
  key: string,
  defaultValue: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => getJSON<T>(key, defaultValue));

  // Keep the latest key in a ref so the write effect always targets it.
  const keyRef = useRef(key);
  keyRef.current = key;

  useEffect(() => {
    const ok = setJSON(keyRef.current, state);
    if (!ok && globalWriteErrorHandler) {
      globalWriteErrorHandler(keyRef.current);
    }
  }, [state]);

  return [state, setState];
}

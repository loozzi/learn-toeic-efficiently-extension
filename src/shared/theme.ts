import { useEffect, useState } from 'react';

export type ThemePref = 'system' | 'light' | 'dark';

const KEY = 'imen-theme';

function apply(pref: ThemePref) {
  const root = document.documentElement;
  if (pref === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', pref);
}

export function useTheme(): [ThemePref, (pref: ThemePref) => void] {
  const [pref, setPref] = useState<ThemePref>(() => (localStorage.getItem(KEY) as ThemePref | null) ?? 'system');

  useEffect(() => { apply(pref); }, [pref]);

  function set(next: ThemePref) {
    localStorage.setItem(KEY, next);
    setPref(next);
  }

  return [pref, set];
}

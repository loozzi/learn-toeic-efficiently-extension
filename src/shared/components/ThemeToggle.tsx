import { Monitor, Moon, Sun } from 'lucide-react';
import { type ThemePref, useTheme } from '../theme';
import { IconButton } from './IconButton';

const ORDER: ThemePref[] = ['system', 'light', 'dark'];
const ICON = { system: Monitor, light: Sun, dark: Moon };
const LABEL = { system: 'Theo hệ thống', light: 'Sáng', dark: 'Tối' } satisfies Record<ThemePref, string>;

export function ThemeToggle() {
  const [pref, setPref] = useTheme();
  const Icon = ICON[pref];

  function cycle() {
    setPref(ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length]);
  }

  return (
    <IconButton aria-label={`Giao diện: ${LABEL[pref]}`} title={`Giao diện: ${LABEL[pref]}`} onClick={cycle}>
      <Icon size={16} strokeWidth={2} />
    </IconButton>
  );
}

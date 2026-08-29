import { Moon, Sun } from 'lucide-react';
import { ToggleButton } from 'react-aria-components';
import { usePreviewTheme } from '../use-preview-theme.ts';

/**
 * Compact header switch between the two preview themes. The accessible name
 * stays fixed and the pressed state carries the answer, so the control never
 * reads as two different buttons depending on the current theme.
 */
export function ThemeToggle(): React.JSX.Element {
  const { setTheme, theme } = usePreviewTheme();
  const light = theme === 'light';
  return (
    <ToggleButton
      aria-label="Light theme"
      className="pixel-button"
      isSelected={light}
      onChange={(selected) => setTheme(selected ? 'light' : 'dark')}
    >
      {light ? <Sun aria-hidden="true" size={16} /> : <Moon aria-hidden="true" size={16} />}
    </ToggleButton>
  );
}

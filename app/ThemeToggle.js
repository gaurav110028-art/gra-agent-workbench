'use client';
import { SunIcon, MoonIcon } from './NavIcons';

export default function ThemeToggle({ theme, onToggle, className = 'themeToggleButton' }) {
  const next = theme === 'dark' ? 'Light' : 'Dark';
  return <button type="button" className={className} onClick={onToggle} title={`Switch to ${next} Mode`} aria-label={`Switch to ${next.toLowerCase()} theme`}>
    <span className="themeToggleIcon" aria-hidden="true">{theme === 'dark' ? <SunIcon /> : <MoonIcon />}</span>
    <span className="sidebarNavLabel">{next} Mode</span>
  </button>;
}

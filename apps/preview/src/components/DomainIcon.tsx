import type { CSSProperties } from 'react';
import { ICON_ARTWORK } from '../icon-catalog.tsx';
import { resolveDomainIcon } from '../icon-resolver.ts';

interface DomainIconProps {
  decorative?: boolean;
  icon?: string;
  label?: string;
  size?: 'large' | 'medium' | 'small';
  type?: string;
}

interface SpriteStyle extends CSSProperties {
  '--icon-accent-hue': number;
  '--icon-hue': number;
  '--icon-variant': number;
}

export function DomainIcon({
  decorative = false,
  icon,
  label,
  size = 'medium',
  type,
}: DomainIconProps): React.JSX.Element {
  const descriptor = resolveDomainIcon({ icon, label, type });
  const style: SpriteStyle = {
    '--icon-accent-hue': descriptor.accentHue,
    '--icon-hue': descriptor.hue,
    '--icon-variant': descriptor.rotation,
  };
  return (
    <span
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : descriptor.accessibleLabel}
      className={`resource-icon resource-icon--${descriptor.kind} resource-icon--${size}`}
      data-resource={`${descriptor.namespace}:${descriptor.resource}`}
      role={decorative ? undefined : 'img'}
      style={style}
    >
      <svg aria-hidden="true" viewBox="0 0 16 16">
        {ICON_ARTWORK[descriptor.kind]}
      </svg>
    </span>
  );
}

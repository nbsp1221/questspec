import type { CSSProperties } from 'react';
import { resolveDomainIcon } from '../icon-resolver.ts';

interface DomainIconProps {
  decorative?: boolean;
  icon?: string;
  label?: string;
  size?: 'large' | 'medium' | 'small';
  type?: string;
}

interface ResourceIconStyle extends CSSProperties {
  '--icon-accent-hue': number;
  '--icon-hue': number;
  '--icon-rotation': string;
}

const artwork: Record<string, React.ReactNode> = {
  combat: (
    <>
      <path className="resource-icon__body" d="m5 18 2 1 11-11-3-3L5 16Z" />
      <path className="resource-icon__detail" d="m13 5 2-2 6 6-2 2ZM4 15l5 5-2 2-5-5Z" />
    </>
  ),
  complete: (
    <>
      <path className="resource-icon__body" d="m12 2 8 3v6c0 5-3.4 8.8-8 11-4.6-2.2-8-6-8-11V5Z" />
      <path className="resource-icon__cut" d="m7.4 11.7 2.9 2.8 6.2-6.3" />
    </>
  ),
  experience: (
    <>
      <path className="resource-icon__body" d="m12 2 7 6-2.5 10L12 22l-4.5-4L5 8Z" />
      <path className="resource-icon__shine" d="m12 5 3.5 3-1.2 5.2-2.3 2-2.3-2L8.5 8Z" />
    </>
  ),
  food: (
    <>
      <path
        className="resource-icon__body"
        d="M12 7c4-4 9 0 8 5-1 6-6 9-8 9s-7-3-8-9c-1-5 4-9 8-5Z"
      />
      <path className="resource-icon__detail" d="M12 7c0-3 2-5 5-5-1 3-2 5-5 5Z" />
      <path className="resource-icon__shine" d="M7 11c1-2 2-3 4-3" />
    </>
  ),
  knowledge: (
    <>
      <path
        className="resource-icon__body"
        d="M3 4h7c1.2 0 2 .8 2 2v15c0-1.5-1.2-3-3-3H3Zm18 0h-7c-1.2 0-2 .8-2 2v15c0-1.5 1.2-3 3-3h6Z"
      />
      <path className="resource-icon__detail" d="M6 8h3M6 11h3M15 8h3M15 11h3" />
    </>
  ),
  magic: (
    <>
      <path
        className="resource-icon__body"
        d="M9 3h6v4l4 8c1.7 3.5-.2 6-3.5 6h-7C5.2 21 3.3 18.5 5 15l4-8Z"
      />
      <path className="resource-icon__detail" d="M8 14h8l2 4H6Z" />
      <path className="resource-icon__shine" d="M10 4h4M9 11h6" />
    </>
  ),
  material: (
    <>
      <path className="resource-icon__body" d="m5 8 4-4h9l2 5-5 10H5L3 14Z" />
      <path className="resource-icon__detail" d="m5 8 5 3h9M10 11l-2 8" />
      <path className="resource-icon__shine" d="m9 6 7-1" />
    </>
  ),
  nature: (
    <>
      <path className="resource-icon__body" d="M4 6h13l3 4v9H7l-3-4Z" />
      <path className="resource-icon__detail" d="M7 6v13M17 6l-3 4v9M7 10h13M10 13h2m3 3h2" />
      <path className="resource-icon__shine" d="M6 7h9" />
    </>
  ),
  place: (
    <>
      <path className="resource-icon__body" d="M3 19 8 9l4 5 3-4 6 9Z" />
      <path className="resource-icon__detail" d="m6 15 2-2 2 2 2-1 3 3 2-3 2 3" />
      <path className="resource-icon__shine" d="M4 19h17" />
    </>
  ),
  quest: (
    <>
      <path className="resource-icon__body" d="m4 7 8-4 8 4v10l-8 4-8-4Z" />
      <path className="resource-icon__detail" d="m4 7 8 4 8-4M12 11v10" />
      <path className="resource-icon__shine" d="m8 5 8 4" />
    </>
  ),
  tool: (
    <>
      <path className="resource-icon__body" d="m4 3 8 4-2 3-3-1-3 12-3-1L4 8 2 6Z" />
      <path className="resource-icon__detail" d="m10 7 9-3 3 3-11 4Z" />
      <path className="resource-icon__shine" d="m6 9-3 10" />
    </>
  ),
  transport: (
    <>
      <path className="resource-icon__body" d="M7 3h10l2 15H5Z" />
      <path className="resource-icon__detail" d="M8 3 6 21m10-18 2 18M6 8h12M6 13h12M5 18h14" />
    </>
  ),
};

export function DomainIcon({
  decorative = false,
  icon,
  label,
  size = 'medium',
  type,
}: DomainIconProps): React.JSX.Element {
  const descriptor = resolveDomainIcon({ icon, label, type });
  const style: ResourceIconStyle = {
    '--icon-accent-hue': descriptor.accentHue,
    '--icon-hue': descriptor.hue,
    '--icon-rotation': `${descriptor.rotation}deg`,
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
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <g className="resource-icon__art">{artwork[descriptor.kind]}</g>
        <text className="resource-icon__monogram" x="18.8" y="20.2">
          {descriptor.monogram}
        </text>
      </svg>
    </span>
  );
}

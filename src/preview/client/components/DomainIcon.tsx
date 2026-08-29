import { resolveDomainIcon } from '../icon-resolver.ts';

interface DomainIconProps {
  decorative?: boolean;
  icon?: string;
  label?: string;
  size?: 'large' | 'medium' | 'small';
  type?: string;
}

const paths: Record<string, React.ReactNode> = {
  combat: (
    <>
      <path d="M6 19 18 7M8 5l11 11M5 16l3 3M15 5l4 4" />
      <path d="m5 5 4 1-3 3Z" />
    </>
  ),
  complete: <path d="m5 12 4 4L19 7" />,
  experience: (
    <>
      <path d="m12 4 2.1 4.7L19 10l-3.7 3.4.9 5.1L12 16l-4.2 2.5.9-5.1L5 10l4.9-1.3Z" />
    </>
  ),
  food: (
    <>
      <path d="M8 19c-3-4-2-10 3-12 4-2 8 1 7 5-1 5-6 8-10 7Z" />
      <path d="M10 7c0-2 1-3 3-4" />
    </>
  ),
  knowledge: (
    <>
      <path d="M4 5h6c2 0 2 2 2 2v12s0-2-2-2H4Z" />
      <path d="M20 5h-6c-2 0-2 2-2 2v12s0-2 2-2h6Z" />
    </>
  ),
  magic: (
    <>
      <path d="m5 19 10-10" />
      <path d="m14 5 .7 2.3L17 8l-2.3.7L14 11l-.7-2.3L11 8l2.3-.7Z" />
      <path d="m18 13 .5 1.5L20 15l-1.5.5L18 17l-.5-1.5L16 15l1.5-.5Z" />
    </>
  ),
  material: (
    <>
      <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9Z" />
      <path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
    </>
  ),
  nature: (
    <>
      <path d="M12 20v-9" />
      <path d="M12 13C6 13 5 8 6 5c4 0 7 2 6 8ZM12 16c5 0 7-3 7-6-4 0-7 2-7 6Z" />
    </>
  ),
  place: (
    <>
      <path d="M12 21s7-6 7-12a7 7 0 1 0-14 0c0 6 7 12 7 12Z" />
      <path d="M12 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
    </>
  ),
  quest: (
    <>
      <path d="M5 5h14v14H5Z" />
      <path d="M8 9h8M8 13h5" />
    </>
  ),
  tool: (
    <>
      <path d="m5 19 8-8" />
      <path d="M14 4a5 5 0 0 0-1 6l-3 3a5 5 0 0 1-6-1l4-2 2-4Z" />
      <path d="m15 15 4 4" />
    </>
  ),
  transport: (
    <>
      <path d="M6 18h12M8 18l2-12h4l2 12M9 10h6M8 14h8" />
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
  return (
    <span
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : descriptor.accessibleLabel}
      className={`domain-icon domain-icon--${descriptor.kind} domain-icon--${size}`}
      role={decorative ? undefined : 'img'}
    >
      <svg
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
        viewBox="0 0 24 24"
      >
        {paths[descriptor.kind]}
      </svg>
    </span>
  );
}

import { cn } from '@questspec/ui/lib/utils';
import * as React from 'react';
import {
  Focusable,
  OverlayArrow,
  Tooltip as TooltipPrimitive,
  TooltipTrigger as TooltipTriggerPrimitive,
} from 'react-aria-components';

type TooltipTriggerProps = Omit<
  React.ComponentProps<typeof TooltipTriggerPrimitive>,
  'children'
> & {
  children: [React.ComponentProps<typeof Focusable>['children'], React.ReactNode];
};

function TooltipTrigger({
  delay = 0,
  children: [trigger, tooltip],
  ...props
}: TooltipTriggerProps) {
  return (
    <TooltipTriggerPrimitive data-slot="tooltip-trigger" delay={delay} {...props}>
      <Focusable>{trigger}</Focusable>
      {tooltip}
    </TooltipTriggerPrimitive>
  );
}

function Tooltip({
  className,
  placement = 'top',
  offset = 4,
  crossOffset = 0,
  children,
  showArrow = true,
  ...props
}: Omit<React.ComponentProps<typeof TooltipPrimitive>, 'children' | 'className'> & {
  className?: string;
  children?: React.ReactNode;
  showArrow?: boolean;
}) {
  return (
    <TooltipPrimitive
      data-slot="tooltip-content"
      placement={placement}
      offset={offset}
      crossOffset={crossOffset}
      className={cn(
        'z-50 inline-flex w-fit max-w-xs items-center gap-1.5 rounded-md border border-border bg-popover px-3 py-1.5 text-xs text-popover-foreground has-data-[slot=kbd]:pr-1.5 **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-50 **:data-[slot=kbd]:rounded-sm',
        className,
      )}
      {...props}
    >
      {children}
      {showArrow ? (
        <OverlayArrow
          className="z-50 size-2.5 translate-y-[calc(-50%-2px)] rotate-45 rounded-[2px] bg-popover fill-popover"
          style={({ placement, defaultStyle }) => ({
            ...defaultStyle,
            rotate: '0deg',
            translate: '0 0',
            transform:
              placement === 'bottom'
                ? 'translate(-50%, calc(50% + 2px)) rotate(45deg)'
                : placement === 'top'
                  ? 'translate(-50%, calc(-50% - 2px)) rotate(45deg)'
                  : placement === 'left'
                    ? 'translate(calc(-50% - 2px), -50%) rotate(45deg)'
                    : 'translate(calc(50% + 2px), -50%) rotate(45deg)',
          })}
        />
      ) : null}
    </TooltipPrimitive>
  );
}

export { Tooltip, TooltipTrigger };

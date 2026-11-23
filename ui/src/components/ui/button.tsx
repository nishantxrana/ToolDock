import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils/cn';

const buttonVariants = cva(
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-45 active:translate-y-px [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.15),0_1px_2px_rgb(0_0_0/0.12)] hover:bg-primary-hover',
        destructive:
          'bg-destructive text-destructive-foreground shadow-[0_1px_2px_rgb(0_0_0/0.12)] hover:bg-destructive/90',
        outline:
          'border border-border bg-popover text-foreground shadow-[0_1px_0_rgb(0_0_0/0.03)] hover:border-border-strong hover:bg-row-hover',
        secondary: 'bg-muted text-foreground hover:bg-muted/70',
        ghost: 'text-foreground/80 hover:bg-foreground/[0.06] hover:text-foreground',
        link: 'h-auto px-0 text-foreground underline decoration-border-strong underline-offset-[3px] transition-colors hover:decoration-foreground',
      },
      size: {
        xs: 'h-7 gap-1.5 rounded px-2 text-xs [&_svg]:size-3.5',
        sm: 'h-8 gap-1.5 px-3 text-13',
        default: 'h-9 px-4',
        lg: 'h-10 px-5',
        icon: 'h-9 w-9',
        'icon-sm': 'h-8 w-8',
        'icon-xs': 'h-7 w-7 rounded [&_svg]:size-3.5',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        // Default to type="button" so buttons inside forms never submit by accident.
        {...(asChild ? {} : { type: type ?? 'button' })}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };

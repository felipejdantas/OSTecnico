import { type ButtonHTMLAttributes, forwardRef } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
    size?: 'sm' | 'md' | 'lg';
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
        const variants = {
            primary: 'bg-gradient-to-r from-primary-cyan to-primary-cyan-dark text-white hover:from-primary-cyan-dark hover:to-primary-cyan shadow-md hover:shadow-lg',
            secondary: 'bg-gradient-to-r from-gray-600 to-gray-700 text-white hover:from-gray-700 hover:to-gray-600 shadow-md hover:shadow-lg',
            outline: 'border-2 border-primary-cyan text-primary-cyan hover:bg-primary-cyan/5 hover:border-primary-cyan-dark',
            ghost: 'hover:bg-gray-100 text-dark hover:text-dark-darker',
            danger: 'bg-gradient-to-r from-danger to-red-600 text-white hover:from-red-600 hover:to-danger shadow-md hover:shadow-lg',
        };

        const sizes = {
            sm: 'px-3 py-1.5 text-sm',
            md: 'px-5 py-2.5',
            lg: 'px-6 py-3 text-lg',
        };

        return (
            <button
                ref={ref}
                className={cn(
                    'rounded-xl font-semibold transition-all duration-300 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center',
                    variants[variant],
                    sizes[size],
                    className
                )}
                {...props}
            />
        );
    }
);

Button.displayName = 'Button';

export { Button, cn };

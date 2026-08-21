import type { HTMLAttributes, PropsWithChildren } from 'react';
import { Link } from 'react-router-dom';

interface MarketingSectionProps extends PropsWithChildren<
  HTMLAttributes<HTMLElement>
> {
  tone?: 'canvas' | 'night' | 'paper' | 'warm';
}

export function MarketingContainer({
  children,
  className = '',
}: PropsWithChildren<{ className?: string }>) {
  return <div className={`marketing-container ${className}`}>{children}</div>;
}

export function MarketingSection({
  children,
  className = '',
  tone = 'canvas',
  ...props
}: MarketingSectionProps) {
  return (
    <section
      className={`marketing-section marketing-tone-${tone} ${className}`}
      {...props}
    >
      {children}
    </section>
  );
}

export function DisplayHeading({
  as = 'h2',
  children,
  className = '',
}: PropsWithChildren<{ as?: 'h1' | 'h2' | 'h3'; className?: string }>) {
  const Heading = as;
  return (
    <Heading className={`marketing-display ${className}`}>{children}</Heading>
  );
}

export function SectionEyebrow({ children }: PropsWithChildren) {
  return <p className="marketing-eyebrow">{children}</p>;
}

export function HairlineDivider({ className = '' }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`marketing-hairline ${className}`} />
  );
}

export function MarketingButton({
  children,
  href,
  variant = 'primary',
}: PropsWithChildren<{
  href: string;
  variant?: 'ghost' | 'primary' | 'secondary';
}>) {
  return (
    <Link className={`marketing-button is-${variant}`} to={href}>
      {children}
    </Link>
  );
}

export function ResponsiveMedia({
  alt,
  className = '',
  height,
  loading = 'lazy',
  src,
  width,
}: {
  alt: string;
  className?: string;
  height: number;
  loading?: 'eager' | 'lazy';
  src: string;
  width: number;
}) {
  return (
    <img
      alt={alt}
      className={`marketing-media ${className}`}
      decoding="async"
      height={height}
      loading={loading}
      src={src}
      width={width}
    />
  );
}

import type { ReactNode } from "react";

type IconProps = {
  className?: string;
  title?: string;
};

function Svg({
  className,
  title,
  children,
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      className={className}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden={title ? undefined : true}
      focusable="false"
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

const stroke = {
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function IconLock(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="5" y="10" width="14" height="11" rx="2" stroke="currentColor" {...stroke} />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" {...stroke} />
    </Svg>
  );
}

export function IconEnvelope(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" {...stroke} />
      <path d="M3 7l9 7 9-7" stroke="currentColor" {...stroke} />
    </Svg>
  );
}

export function IconShieldCheck(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M12 3l8 3v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-3z"
        stroke="currentColor"
        {...stroke}
      />
      <path d="M9 12l2 2 4-4" stroke="currentColor" {...stroke} />
    </Svg>
  );
}

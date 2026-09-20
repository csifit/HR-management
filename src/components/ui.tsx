import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, Users, Plus, type LucideIcon } from "lucide-react";
import { brand } from "@/lib/brand";
import type { Dictionary } from "@/lib/i18n";
export function Brand({ light = false }: { light?: boolean }) {
  return (
    <Link
      href="/dashboard"
      className={`brand ${light ? "brand-light" : ""}`}
      aria-label={brand.name}
    >
      {brand.logoUrl ? (
        <Image
          src={brand.logoUrl}
          alt=""
          width={38}
          height={38}
          unoptimized
          className="brand-logo"
        />
      ) : (
        <span className="brand-mark">
          {brand.monogram}
          <span>•</span>
        </span>
      )}
      <span>{brand.name}</span>
    </Link>
  );
}
export function StatusBadge({ value, d }: { value: string; d: Dictionary }) {
  const label = value in d ? d[value as keyof Dictionary] : value;
  return (
    <span className={`status-badge status-${value}`}>
      <span />
      {label}
    </span>
  );
}
export function Avatar({
  name,
  size = "normal",
}: {
  name: string;
  size?: "normal" | "large";
}) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("");
  const tone = name.charCodeAt(0) % 4;
  return (
    <span className={`avatar avatar-${tone} avatar-${size}`} aria-hidden="true">
      {initials}
    </span>
  );
}
export function PageHeader({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children && <div className="heading-actions">{children}</div>}
    </div>
  );
}
export function EmptyState({
  title,
  description,
  href,
  label,
  icon: Icon = Users,
}: {
  title: string;
  description?: string;
  href?: string;
  label?: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Icon size={25} strokeWidth={1.6} />
      </div>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {href && (
        <Link className="button primary" href={href}>
          <Plus size={17} />
          {label}
        </Link>
      )}
    </div>
  );
}
export function Metric({
  title,
  value,
  caption,
  icon: Icon,
  href,
}: {
  title: string;
  value: number;
  caption: string;
  icon: LucideIcon;
  href?: string;
}) {
  const content = (
    <>
      <div className="metric-top">
        <span>{title}</span>
        <Icon size={19} />
      </div>
      <strong>{value}</strong>
      <div className="metric-bottom">
        <span>{caption}</span>
        {href && <ArrowUpRight size={16} />}
      </div>
    </>
  );
  return href ? (
    <Link className="metric card" href={href}>
      {content}
    </Link>
  ) : (
    <div className="metric card">{content}</div>
  );
}
export function Detail({
  label,
  children,
}: {
  label: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="detail">
      <dt>{label}</dt>
      <dd>{children || "—"}</dd>
    </div>
  );
}

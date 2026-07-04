import * as React from "react";
import { cn } from "../lib/cn";

export interface SiteFooterColumn {
  heading: string;
  links: Array<{ label: string; href: string }>;
}

export interface SiteFooterProps extends React.HTMLAttributes<HTMLElement> {
  logo: React.ReactNode;
  tagline: string;
  columns: SiteFooterColumn[];
  socials?: Array<{ label: string; href: string; icon: React.ReactNode }>;
  legalLinks?: Array<{ label: string; href: string }>;
  copyrightYear: number;
  channelName: string;
}

function SiteFooter({
  className,
  logo,
  tagline,
  columns,
  socials = [],
  legalLinks = [],
  copyrightYear,
  channelName,
  ...props
}: SiteFooterProps) {
  return (
    <footer className={cn("bp-footer", className)} {...props}>
      <div className="bp-footer-top">
        <div className="bp-footer-brandcol">
          {logo}
          <p>{tagline}</p>
          {socials.length > 0 && (
            <div className="bp-footer-socials">
              {socials.map((s) => (
                <a key={s.href} href={s.href} aria-label={s.label}>
                  {s.icon}
                </a>
              ))}
            </div>
          )}
        </div>
        {columns.map((col) => (
          <div key={col.heading} className="bp-footer-col">
            <h5>{col.heading}</h5>
            {col.links.map((l) => (
              <a key={l.href} href={l.href}>
                {l.label}
              </a>
            ))}
          </div>
        ))}
      </div>
      <div className="bp-footer-legal">
        <span>
          © {copyrightYear} {channelName}. All rights reserved.
        </span>
        {legalLinks.map((l) => (
          <a key={l.href} href={l.href}>
            {l.label}
          </a>
        ))}
      </div>
    </footer>
  );
}

export { SiteFooter };

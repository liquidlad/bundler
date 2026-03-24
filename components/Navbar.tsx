"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/launch", label: "Launch" },
  { href: "/wallets", label: "Wallets" },
  { href: "/sell", label: "Sell" },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav
      className="border-b px-6 py-4"
      style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-8">
          <h1
            className="text-xl font-bold tracking-tight"
            style={{ color: "var(--accent)" }}
          >
            BUNDLER
          </h1>
          <div className="flex gap-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{
                  background:
                    pathname === link.href ? "var(--bg-card)" : "transparent",
                  color:
                    pathname === link.href
                      ? "var(--accent)"
                      : "var(--text-secondary)",
                }}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="status-dot active" />
          <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Ready
          </span>
        </div>
      </div>
    </nav>
  );
}

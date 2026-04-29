import { NavLink } from "react-router-dom";
import { FolderOpen, ShieldCheck, Settings } from "lucide-react";

const navItems = [
  { to: "/", label: "Proyecto", icon: FolderOpen },
  { to: "/qa-export", label: "QA + Export", icon: ShieldCheck },
  { to: "/prompts", label: "Prompts", icon: Settings },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border bg-card px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
            <span className="font-display text-primary-foreground text-sm font-bold">SC</span>
          </div>
          <h1 className="font-display text-sm font-semibold tracking-tight">SEO Clusters & Titles</h1>
        </div>
        <nav className="flex items-center gap-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`
              }
            >
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">{children}</main>
    </div>
  );
}

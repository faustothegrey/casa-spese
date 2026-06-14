"use client";

// Guscio dell'app: sidebar sinistra comprimibile + area contenuti.
// Due sezioni: Riconciliazione spese (/) e Analisi investimenti (/investimenti).
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

interface NavItem {
  href: string;
  label: string;
  icon: string;
  desc: string;
}

const NAV: NavItem[] = [
  { href: "/", label: "Riconciliazione spese", icon: "🧾", desc: "Spese da sistemare" },
  { href: "/investimenti", label: "Analisi investimenti", icon: "📈", desc: "Patrimonio e titoli" },
  { href: "/consulente", label: "Consulente", icon: "💬", desc: "Chat con l'AI" },
];

const STORAGE_KEY = "casaspese-sidebar-collapsed";

// Stato "sidebar compressa" persistito in localStorage, esposto via useSyncExternalStore
// (gestisce SSR e idratazione senza setState dentro un effetto).
const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function getSnapshot() {
  return localStorage.getItem(STORAGE_KEY) === "1";
}
function getServerSnapshot() {
  return false;
}
function setCollapsedStore(value: boolean) {
  localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  listeners.forEach((l) => l());
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const collapsed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = () => setCollapsedStore(!collapsed);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <div className="flex min-h-screen">
      <aside
        className={`${collapsed ? "w-16" : "w-60"} shrink-0 bg-white border-r border-gray-200 flex flex-col transition-[width] duration-200 sticky top-0 h-screen`}
      >
        {/* Brand + toggle */}
        <div className="h-16 flex items-center gap-2 px-3 border-b border-gray-100">
          {!collapsed && (
            <span className="font-bold text-gray-900 truncate">CasaSpese</span>
          )}
          <button
            onClick={toggle}
            title={collapsed ? "Espandi" : "Comprimi"}
            className="ml-auto w-9 h-9 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 active:scale-95 transition-all cursor-pointer"
          >
            {collapsed ? "»" : "«"}
          </button>
        </div>

        {/* Navigazione */}
        <nav className="flex-1 p-2 flex flex-col gap-1">
          {NAV.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all ${
                  active
                    ? "bg-blue-50 text-blue-700 font-semibold"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                } ${collapsed ? "justify-center" : ""}`}
              >
                <span className="text-lg leading-none shrink-0">{item.icon}</span>
                {!collapsed && (
                  <span className="flex flex-col min-w-0">
                    <span className="text-sm truncate">{item.label}</span>
                    <span className="text-[11px] text-gray-400 font-normal truncate">
                      {item.desc}
                    </span>
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </aside>

      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}

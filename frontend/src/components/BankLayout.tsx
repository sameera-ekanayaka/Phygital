import { useEffect } from "react";
import { Outlet, NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Shield,
  ScanLine,
  FileText,
  Lock,
  User,
  ChevronRight,
  LogOut,
} from "lucide-react";

const navItems = [
  { to: "/bank/verify", label: "Verify Code", icon: ScanLine },
  { to: "/bank/dossier", label: "Dossier", icon: FileText },
];

const pageTitles: Record<string, string> = {
  "/bank/verify": "Verification Code",
  "/bank/dossier": "AI Credit Dossier",
};

export default function BankLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const currentTitle = pageTitles[location.pathname] ?? "Verification Code";
  const officerName = localStorage.getItem("phygital_officer_name") || "Officer";

  function handleLogout() {
    localStorage.removeItem("phygital_access_token");
    localStorage.removeItem("phygital_officer_name");
    navigate("/");
  }

  /* Auth wall — redirect to login when no token is present */
  useEffect(() => {
    const token = localStorage.getItem("phygital_access_token");
    if (!token) {
      navigate("/bank/login", { replace: true });
    }
  }, [location.pathname, navigate]);

  return (
    <div className="min-h-screen bg-navy-900 flex flex-col lg:flex-row">
      {/* ── Sidebar ────────────────────────────────────────────────── */}
      <aside className="hidden lg:flex lg:w-64 flex-col bg-navy-800 border-r border-navy-700/50 shrink-0">
        {/* Logo area */}
        <div className="px-6 py-6 border-b border-navy-700/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gold/15 border border-gold/30 flex items-center justify-center">
              <Shield className="w-5 h-5 text-gold" />
            </div>
            <div>
              <div className="text-sm font-bold text-white tracking-wide">
                Phygital
              </div>
              <div className="text-[11px] text-navy-600 font-medium tracking-wider uppercase">
                Credit Assessment
              </div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? "bg-gold/10 text-gold border border-gold/20"
                    : "text-slate-400 hover:text-white hover:bg-navy-700/60 border border-transparent"
                }`
              }
            >
              <Icon className="w-4.5 h-4.5 shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Sidebar footer */}
        <div className="px-4 py-4 border-t border-navy-700/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-navy-700 flex items-center justify-center border border-navy-600">
              <User className="w-4 h-4 text-slate-400" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-white truncate">
                {officerName}
              </div>
              <div className="text-[11px] text-slate-500 truncate">
                Branch — Colombo 03
              </div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="mt-3 w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-navy-700/60 transition-colors"
            title="Sign out"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* ── Main content ───────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-screen min-w-0">
        {/* Mobile top bar */}
        <header className="lg:hidden flex items-center justify-between px-4 py-3 bg-navy-800 border-b border-navy-700/50">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-gold" />
            <span className="text-sm font-bold text-white">Phygital</span>
          </div>
          <div className="flex items-center gap-2">
            {navItems.map(({ to, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `p-2 rounded-lg transition-colors ${
                    isActive
                      ? "bg-gold/15 text-gold"
                      : "text-slate-400 hover:text-white"
                  }`
                }
              >
                <Icon className="w-5 h-5" />
              </NavLink>
            ))}
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg text-slate-400 hover:text-white transition-colors"
              title="Sign out"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Desktop top bar */}
        <div className="hidden lg:flex items-center justify-between px-8 py-4 border-b border-navy-700/30 bg-navy-900/80 backdrop-blur">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-500">Phygital</span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
            <span className="text-white font-medium">{currentTitle}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="badge-green">
              <Lock className="w-3 h-3" />
              Secured Session
            </span>
          </div>
        </div>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-8 overflow-y-auto">
          <Outlet />
        </main>

        {/* Footer */}
        <footer className="px-4 lg:px-8 py-3 border-t border-navy-700/30 flex items-center justify-between text-[11px] text-slate-500">
          <span>Phygital Credit Assessment Platform v1.0</span>
          <span className="flex items-center gap-1.5">
            <Lock className="w-3 h-3 text-emerald-500" />
            <span className="text-emerald-500/80">Secured & Encrypted</span>
            <span className="mx-2 text-slate-700">|</span>
            <span>AES-256 · TLS 1.3</span>
          </span>
        </footer>
      </div>
    </div>
  );
}

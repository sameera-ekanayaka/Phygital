import { Outlet, Link } from "react-router-dom";
import { Shield } from "lucide-react";

export default function BorrowerLayout() {
  return (
    <div className="borrower-portal min-h-screen b-paper-bg flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-5 py-4 bg-cream-50/80 backdrop-blur-sm border-b border-cream-300/60">
        <Link to="/borrower/upload" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-teal flex items-center justify-center shadow-sm">
            <Shield className="w-4.5 h-4.5 text-white" />
          </div>
          <div>
            <span className="text-base font-bold text-warm-900 tracking-tight font-display">
              Phygital
            </span>
            <span className="block text-[10px] text-warm-600 font-medium -mt-0.5 tracking-wide">
              SME Credit Portal
            </span>
          </div>
        </Link>
        <span className="text-[11px] text-warm-600/70 font-medium hidden sm:block font-handwritten text-base">
          Empowering informal businesses
        </span>
      </header>

      {/* Page content */}
      <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8 overflow-y-auto">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="px-4 py-3 border-t border-cream-300/60 text-center">
        <span className="text-xs text-warm-600/60">
          Phygital — Empowering Informal SMEs
        </span>
      </footer>
    </div>
  );
}

import { useEffect } from "react";
import { Outlet, Link, useNavigate, useLocation } from "react-router-dom";
import { Shield, LogOut } from "lucide-react";

const BORROWER_TOKEN_KEY = "phygital_borrower_token";
const BORROWER_NAME_KEY = "phygital_borrower_name";

export default function BorrowerLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  /* Auth wall — redirect to login when no token is present */
  useEffect(() => {
    const token = sessionStorage.getItem(BORROWER_TOKEN_KEY);
    if (!token) {
      navigate("/borrower/login", { replace: true });
    }
  }, [location.pathname, navigate]);

  const borrowerName = sessionStorage.getItem(BORROWER_NAME_KEY);

  function handleLogout() {
    sessionStorage.removeItem(BORROWER_TOKEN_KEY);
    sessionStorage.removeItem(BORROWER_NAME_KEY);
    navigate("/");
  }

  return (
    <div className="borrower-portal min-h-screen b-paper-bg flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-5 py-4 bg-cream-50/80 backdrop-blur-sm border-b border-cream-300/60">
        <Link to="/borrower/dashboard" className="flex items-center gap-2.5">
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
        <div className="flex items-center gap-3">
          {borrowerName && (
            <span className="text-xs font-medium text-warm-700 hidden sm:block">
              {borrowerName}
            </span>
          )}
          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-warm-600 hover:text-warm-900 hover:bg-cream-200 transition-colors"
            title="Sign out"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
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

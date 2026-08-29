import { Link, useLocation } from "react-router-dom";

export default function NotFound() {
  const { pathname } = useLocation();
  const isBankPortal = pathname.startsWith("/bank");

  return (
    <div className="flex min-h-[60vh] items-center justify-center text-white">
      <div className="text-center space-y-4">
        <h1 className="text-6xl font-bold text-gray-500">404</h1>
        <p className="text-xl text-gray-400">Page not found</p>
        <div className="flex items-center justify-center gap-3">
          <Link
            to="/"
            className="inline-block rounded-lg bg-blue-600 px-6 py-2 font-medium hover:bg-blue-700 transition-colors"
          >
            Go Home
          </Link>
          {isBankPortal && (
            <Link
              to="/bank/verify"
              className="inline-block rounded-lg bg-navy-700 border border-navy-600 px-6 py-2 font-medium text-white hover:bg-navy-600 transition-colors"
            >
              Back to Bank Portal
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

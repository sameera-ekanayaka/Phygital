import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";

// Layouts
const BorrowerLayout = lazy(() => import("./components/BorrowerLayout"));
const BankLayout = lazy(() => import("./components/BankLayout"));

// Pages
const Landing = lazy(() => import("./pages/Landing"));
const NotFound = lazy(() => import("./pages/NotFound"));

// Borrower portal
const BorrowerLogin = lazy(() => import("./pages/borrower/BorrowerLogin"));
const BorrowerRegister = lazy(() => import("./pages/borrower/BorrowerRegister"));
const BorrowerOTP = lazy(() => import("./pages/borrower/BorrowerOTP"));
const BorrowerDashboard = lazy(() => import("./pages/borrower/BorrowerDashboard"));
const BorrowerUpload = lazy(() => import("./pages/borrower/BorrowerUpload"));
const BorrowerProcessing = lazy(() => import("./pages/borrower/BorrowerProcessing"));
const BorrowerSuccess = lazy(() => import("./pages/borrower/BorrowerSuccess"));
const BorrowerAddTransaction = lazy(() => import("./pages/borrower/BorrowerAddTransaction"));

// Bank portal
const BankLogin = lazy(() => import("./pages/bank/BankLogin"));
const BankVerify = lazy(() => import("./pages/bank/BankVerify"));
const BankDossier = lazy(() => import("./pages/bank/BankDossier"));

function LoadingSpinner() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<LoadingSpinner />}>
        <Routes>
          {/* Global entry */}
          <Route path="/" element={<Landing />} />

          {/* Borrower auth — outside auth wall */}
          <Route path="/borrower/login" element={<BorrowerLogin />} />
          <Route path="/borrower/register" element={<BorrowerRegister />} />
          <Route path="/borrower/verify-otp" element={<BorrowerOTP />} />

          {/* Borrower portal — mobile-first, auth wall via BorrowerLayout */}
          <Route element={<BorrowerLayout />}>
            <Route path="/borrower/dashboard" element={<BorrowerDashboard />} />
            <Route path="/borrower/upload" element={<BorrowerUpload />} />
            <Route path="/borrower/processing" element={<BorrowerProcessing />} />
            <Route path="/borrower/success" element={<BorrowerSuccess />} />
            <Route path="/borrower/add-transaction" element={<BorrowerAddTransaction />} />
          </Route>

          {/* Bank portal — login outside auth wall */}
          <Route path="/bank/login" element={<BankLogin />} />

          {/* Bank portal — desktop-first, auth wall via BankLayout */}
          <Route element={<BankLayout />}>
            <Route path="/bank/verify" element={<BankVerify />} />
            <Route path="/bank/dossier" element={<BankDossier />} />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

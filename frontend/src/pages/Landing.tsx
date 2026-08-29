import { Link } from "react-router-dom";
import { Shield, Store, Building2 } from "lucide-react";

function Landing() {
  return (
    <div className="min-h-screen bg-navy-900 flex flex-col items-center justify-center px-4 py-12 relative overflow-hidden">
      {/* Subtle background grain */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.03]"
           style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E\")", backgroundSize: "200px" }} />

      {/* Top glow accent */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full bg-gold/5 blur-3xl" />

      {/* Branding */}
      <div className="relative z-10 flex flex-col items-center text-center mb-14 fade-in-up">
        <div className="w-16 h-16 rounded-2xl bg-gold/10 border border-gold/30 flex items-center justify-center mb-6 shadow-lg shadow-gold/10">
          <Shield className="w-8 h-8 text-gold" strokeWidth={1.5} />
        </div>

        <h1 className="text-5xl font-bold tracking-tight text-white mb-1" style={{ fontFamily: "'Playfair Display', serif" }}>
          Phygital
        </h1>
        <p className="text-sm font-medium tracking-[0.3em] uppercase text-gold/80 mb-6">
          Cash-Flow Identity Engine
        </p>
        <p className="text-lg text-slate-300/80 max-w-md leading-relaxed">
          Bridging Informal SMEs to Formal Credit
        </p>
      </div>

      {/* Action Cards */}
      <div className="relative z-10 w-full max-w-3xl grid grid-cols-1 md:grid-cols-2 gap-6 mb-16">
        {/* Card 1 — Business Owner */}
        <Link
          to="/borrower/upload"
          className="card group p-8 flex flex-col items-start gap-4 transition-all duration-300 hover:scale-[1.03] hover:border-gold/50 hover:shadow-gold/10 hover:shadow-xl fade-in-up"
          style={{ animationDelay: "0.15s" }}
        >
          <div className="w-12 h-12 rounded-xl bg-teal/10 border border-teal/30 flex items-center justify-center group-hover:bg-teal/20 transition-colors duration-200">
            <Store className="w-6 h-6 text-teal" strokeWidth={1.5} />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white mb-2">
              I am a Business Owner
            </h2>
            <p className="text-sm text-slate-400 leading-relaxed">
              Upload your financial records and get a verification code for your bank
            </p>
          </div>
          <span className="mt-auto text-xs font-medium text-teal/70 group-hover:text-teal transition-colors duration-200 tracking-wide uppercase">
            Get started →
          </span>
        </Link>

        {/* Card 2 — Bank Officer */}
        <Link
          to="/bank/login"
          className="card group p-8 flex flex-col items-start gap-4 transition-all duration-300 hover:scale-[1.03] hover:border-gold/50 hover:shadow-gold/10 hover:shadow-xl fade-in-up"
          style={{ animationDelay: "0.3s" }}
        >
          <div className="w-12 h-12 rounded-xl bg-gold/10 border border-gold/30 flex items-center justify-center group-hover:bg-gold/20 transition-colors duration-200">
            <Building2 className="w-6 h-6 text-gold" strokeWidth={1.5} />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white mb-2">
              I am a Bank Officer
            </h2>
            <p className="text-sm text-slate-400 leading-relaxed">
              Verify merchant credentials and review AI-generated credit dossiers
            </p>
          </div>
          <span className="mt-auto text-xs font-medium text-gold/70 group-hover:text-gold transition-colors duration-200 tracking-wide uppercase">
            Sign in →
          </span>
        </Link>
      </div>

      {/* Footer */}
      <footer className="relative z-10 text-center fade-in-up" style={{ animationDelay: "0.45s" }}>
        <p className="text-xs text-slate-500 tracking-wide">
          Powered by NCGI · Central Bank of Sri Lanka
        </p>
      </footer>
    </div>
  );
}

export default Landing;

// ============================================================================
// Footer — Matches kin-by-kr8tiv/index.html footer exactly.
// Gold KIN, "by KR8TIV AI", links hover to cyan, centered layout.
// ============================================================================

export function Footer() {
  return (
    <footer
      className="border-t border-white/10 py-16 text-center"
      style={{ background: '#0A0A0A' }}
    >
      {/* KIN branding */}
      <div className="mb-8">
        <h2
          className="font-display text-[2rem] font-extrabold"
          style={{ color: '#ffd700' }}
        >
          KIN
        </h2>
        <p className="text-[0.9rem] mt-2 text-white/70">
          by KR8TIV AI
        </p>
      </div>

      {/* Links — matching source: Twitter (X), Telegram, Terms of Service, Privacy Policy */}
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        <a
          href="https://x.com/kr8tivai"
          target="_blank"
          rel="noopener noreferrer"
          className="text-white/70 transition-colors duration-300 hover:text-[#00f0ff] mx-4"
        >
          Twitter (X)
        </a>
        <a
          href="https://t.me/kr8tivai"
          target="_blank"
          rel="noopener noreferrer"
          className="text-white/70 transition-colors duration-300 hover:text-[#00f0ff] mx-4"
        >
          Telegram
        </a>
        <a
          href="https://github.com/kr8tiv-ai"
          target="_blank"
          rel="noopener noreferrer"
          className="text-white/70 transition-colors duration-300 hover:text-[#00f0ff] mx-4"
        >
          GitHub
        </a>
        <a
          href="/getting-started"
          className="text-white/70 transition-colors duration-300 hover:text-[#00f0ff] mx-4"
        >
          Docs
        </a>
        <a
          href="https://www.meetyourkin.com/terms.html"
          target="_blank"
          rel="noopener noreferrer"
          className="text-white/70 transition-colors duration-300 hover:text-[#00f0ff] mx-4"
        >
          Terms of Service
        </a>
        <a
          href="https://www.meetyourkin.com/terms.html#privacy"
          target="_blank"
          rel="noopener noreferrer"
          className="text-white/70 transition-colors duration-300 hover:text-[#00f0ff] mx-4"
        >
          Privacy Policy
        </a>
      </div>

      {/* Copyright */}
      <p className="mt-12 text-[0.8rem] opacity-50">
        &copy; 2026 KR8TIV AI. All rights reserved.
      </p>
    </footer>
  );
}

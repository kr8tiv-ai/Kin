import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-6">
      <div className="text-center max-w-md">
        <h1 className="font-display text-8xl font-bold bg-gradient-to-r from-cyan-400 via-fuchsia-500 to-amber-400 bg-clip-text text-transparent">
          404
        </h1>
        <p className="mt-4 text-xl text-white/70 font-body">
          This page wandered off into the void.
        </p>
        <p className="mt-2 text-sm text-white/40">
          Even our AI companions couldn&apos;t find it.
        </p>
        <div className="mt-8 flex gap-4 justify-center">
          <Link
            href="/"
            className="px-6 py-3 rounded-xl bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/30 transition-colors font-medium"
          >
            Go Home
          </Link>
          <Link
            href="/dashboard"
            className="px-6 py-3 rounded-xl bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 transition-colors font-medium"
          >
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

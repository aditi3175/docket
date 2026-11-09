// The header and footer every page shares.
const PAGES = [
  ['Overview', 'index.html'], ['Account', 'account.html'], ['Proposals', 'docket.html'], ['Register', 'register.html'], ['Opt out', 'optout.html'],
];
export const REPO = 'https://github.com/aditi3175/docket';

export function Mark({ className = 'h-6 w-6' }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <circle cx="7" cy="16" r="4.5" fill="none" stroke="currentColor" strokeWidth="3" />
      <path d="M11.5 16h8" stroke="#FF786F" strokeWidth="3.5" strokeLinecap="round" />
      <rect x="19.5" y="9.5" width="11" height="13" rx="4" fill="currentColor" />
    </svg>
  );
}

export function Header({ current = 'Overview', dark = true }) {
  return (
    <header className={`sticky top-0 z-40 backdrop-blur-md ${dark ? 'bg-night/95 text-ivory border-b border-white/10' : 'bg-ivory/80 text-ink border-b border-ink/10'}`}>
      <a href="#main" className="absolute -left-[999px] top-2 rounded-md bg-violet px-3 py-2 text-white focus:left-3">Skip to content</a>
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-5 sm:px-8">
        <a href="index.html" className="flex flex-none items-center gap-2.5 font-display text-xl font-bold tracking-tight" aria-label="Docket, overview">
          <Mark /> Docket
        </a>
        <nav aria-label="Pages" className="-mx-1 flex min-w-0 gap-1 overflow-x-auto px-1 [scrollbar-width:none] sm:gap-2">
          {PAGES.map(([label, href]) => (
            <a key={href} href={href} aria-current={label === current ? 'page' : undefined}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition ${label === current ? (dark ? 'bg-white/12 text-white' : 'bg-ink text-ivory') : (dark ? 'text-haze hover:text-white' : 'text-mute hover:text-ink')}`}>
              {label}
            </a>
          ))}
        </nav>
        <span className={`ml-auto hidden flex-none items-center gap-2 rounded-full px-3 py-1 text-xs font-medium lg:inline-flex ${dark ? 'bg-white/8 text-haze ring-1 ring-white/10' : 'bg-ink/5 text-mute'}`}>
          <span className="h-1.5 w-1.5 rounded-full bg-violet-2" /> Read-only · holds no key
        </span>
      </div>
    </header>
  );
}

export function Footer({ censusLine }) {
  return (
    <footer className="bg-night text-haze">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-12 sm:px-8 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2.5 font-display text-2xl font-bold text-ivory"><Mark /> Docket</div>
          <p className="mt-2 max-w-md text-sm">Who can change a NEAR account without a vote, read from the chain by your browser. Docket holds no key and signs nothing.</p>
        </div>
        <div className="flex flex-col gap-1.5 text-sm md:items-end">
          <a className="text-ivory underline decoration-white/30 underline-offset-4 hover:decoration-white" href={REPO}>github.com/aditi3175/docket</a>
          <span>{censusLine}</span>
          <span>MIT licensed · built for the NEAR Hackathon 2026</span>
        </div>
      </div>
    </footer>
  );
}

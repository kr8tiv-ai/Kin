'use client';

const ITEMS_ROW_1 = [
  'AI Powered',
  '24/7 Available',
  'Remembers You',
  'Grows With You',
  'Private & Secure',
  '6 Unique Companions',
  'Built on Bags.fm',
];

const ITEMS_ROW_2 = [
  'Telegram Native',
  'Web Dashboard',
  'Memory System',
  'Personality AI',
  'Creative Tools',
  'Personalized Growth',
  'Solana Powered',
];

function MarqueeRow({
  items,
  reverse = false,
}: {
  items: string[];
  reverse?: boolean;
}) {
  // Duplicate items for seamless loop
  const doubled = [...items, ...items];

  return (
    <div className="group relative overflow-hidden py-4">
      <div
        className="flex w-max gap-8 hover:[animation-play-state:paused]"
        style={{
          animation: `marquee ${reverse ? '35s' : '30s'} linear infinite ${reverse ? 'reverse' : 'normal'}`,
        }}
      >
        {doubled.map((item, i) => (
          <span
            key={`${item}-${i}`}
            className="flex items-center gap-4 whitespace-nowrap font-mono text-xs uppercase tracking-[0.2em] text-white/30"
          >
            <span>{item}</span>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-white/20" />
          </span>
        ))}
      </div>
    </div>
  );
}

export function MarqueeSection() {
  return (
    <section className="relative py-6 overflow-hidden select-none">
      {/* Glass border top */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      {/* Glass border bottom */}
      <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <MarqueeRow items={ITEMS_ROW_1} />
      <MarqueeRow items={ITEMS_ROW_2} reverse />
    </section>
  );
}

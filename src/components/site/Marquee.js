const BRANDS = ['Mercedes-Benz', 'BMW', 'Audi', 'Range Rover', 'Porsche', 'Toyota', 'Volkswagen', 'Hyundai', 'Peugeot', 'Renault', 'Dacia'];

/** Pure-CSS brand marquee (pauses on hover, static grid under reduced motion). */
export default function Marquee({ className = '' }) {
  const items = [...BRANDS, ...BRANDS];
  return (
    <div className={`marquee relative overflow-hidden border-y border-border py-5 ${className}`} aria-label="Brands">
      <div className="pointer-events-none absolute inset-y-0 start-0 z-10 w-24 bg-gradient-to-r from-bg to-transparent rtl:bg-gradient-to-l" />
      <div className="pointer-events-none absolute inset-y-0 end-0 z-10 w-24 bg-gradient-to-l from-bg to-transparent rtl:bg-gradient-to-r" />
      <div className="marquee-track gap-12 px-6">
        {items.map((b, i) => (
          <span key={i} className="font-latin-display whitespace-nowrap text-xl tracking-[0.06em] text-text-2" aria-hidden={i >= BRANDS.length ? 'true' : undefined}>
            {b}
          </span>
        ))}
      </div>
    </div>
  );
}

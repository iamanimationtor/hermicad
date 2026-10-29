import Link from "next/link";

/** نشان تجاری: یک بلوک ساختمانی ساده، بدون تصویر بیت‌مپ. */
export function BrandMark({ size = 40 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="relative grid shrink-0 place-items-center rounded-xl border border-teal-400/30 bg-teal-400/10"
      style={{ width: size, height: size }}
    >
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 22 22" fill="none">
        <path d="M4 18V7.2L11 3l7 4.2V18" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" className="text-teal-300" />
        <path d="M8 18v-5.4h6V18" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" className="text-teal-200/80" />
        <path d="M4 18h14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" className="text-teal-300" />
      </svg>
    </span>
  );
}

export function BrandLockup() {
  return (
    <Link href="/" className="group flex items-center gap-3" aria-label="HERMICAD — خانه">
      <BrandMark />
      <span className="leading-tight">
        <span className="block text-[0.95rem] font-extrabold tracking-[0.16em] text-white transition-colors group-hover:text-teal-200">
          HERMICAD
        </span>
        <span className="mt-0.5 block text-[0.7rem] font-medium text-slate-400">هوش مهندسی ساختمان</span>
      </span>
    </Link>
  );
}

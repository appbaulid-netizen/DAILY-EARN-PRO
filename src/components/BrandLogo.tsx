import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';

interface BrandLogoProps {
  inverted?: boolean;
  size?: 'sm' | 'md';
}

export function BrandLogo({ inverted = false, size = 'md' }: BrandLogoProps) {
  const [imgError, setImgError] = useState(false);

  return (
    <div className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
      <div
        className={`relative overflow-hidden rounded-lg border shrink-0 flex items-center justify-center bg-slate-900 ${
          size === 'sm' ? 'h-8 w-8 border-slate-700' : 'h-9 w-9 border-slate-200 dark:border-slate-700'
        }`}
      >
        {!imgError ? (
          <img
            src="/src/assets/images/brand_emblem_1794576036385.jpg"
            alt="Honey & Bunny Invest emblem"
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <ShieldCheck className="h-5 w-5 text-blue-500" />
        )}
      </div>
      <span
        className={`font-display font-bold tracking-tight whitespace-nowrap shrink-0 ${
          size === 'sm' ? 'text-base' : 'text-lg'
        } ${inverted ? 'text-white' : 'text-slate-900 dark:text-white'}`}
      >
        Honey &amp; Bunny Invest
      </span>
    </div>
  );
}

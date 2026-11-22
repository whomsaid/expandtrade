import { useEffect, useState } from 'react';
import { usePlatformConfig } from '../context/PlatformConfigContext.jsx';

export default function BrandLogo({
  className = '',
  textClassName = '',
  imgClassName = 'h-8 w-auto max-w-[140px] object-contain shrink-0',
  showWordmarkWithImage = true,
  compactBrand = true,
  inverted = false,
}) {
  const { config } = usePlatformConfig();
  const [imgFailed, setImgFailed] = useState(false);

  const logoUrl = (config?.platform_logo_url || '').trim();
  const platformName = (config?.platform_name || 'BizTrade Africa').trim();
  const displayMark = compactBrand ? 'BTA' : platformName;

  useEffect(() => {
    setImgFailed(false);
  }, [logoUrl]);

  const hasValidLogo = Boolean(logoUrl) && !imgFailed;

  if (hasValidLogo) {
    return (
      <span
        title={platformName}
        className={`inline-flex items-center gap-2 whitespace-nowrap shrink-0 ${className}`}
      >
        <img
          src={logoUrl}
          alt={platformName}
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className={imgClassName}
        />
        {showWordmarkWithImage && (
          <span className={`font-bold tracking-tight whitespace-nowrap ${textClassName}`}>
            {displayMark}
          </span>
        )}
      </span>
    );
  }

  return (
    <span
      title={platformName}
      className={`inline-flex items-center gap-2 font-bold tracking-tight whitespace-nowrap shrink-0 ${className}`}
    >
      {compactBrand ? (
        <span
          className={`inline-flex items-center justify-center px-2 py-0.5 rounded-md text-sm font-extrabold tracking-tight ${
            inverted
              ? 'bg-sky-600 text-white'
              : 'bg-[#0B192C] dark:bg-sky-600 text-white'
          }`}
        >
          BTA
        </span>
      ) : (
        <span className={textClassName}>{platformName}</span>
      )}
    </span>
  );
}

import { useEffect, useState } from 'react';
import { usePlatformConfig } from '../context/PlatformConfigContext.jsx';

export default function BrandLogo({
  className = '',
  textClassName = '',
  imgClassName = 'h-8 w-auto max-w-[140px] object-contain shrink-0',
  showWordmarkWithImage = true,
}) {
  const { config } = usePlatformConfig();
  const [imgFailed, setImgFailed] = useState(false);

  const logoUrl = (config?.platform_logo_url || '').trim();
  const platformName = (config?.platform_name || 'BizTrade Africa').trim();

  useEffect(() => {
    setImgFailed(false);
  }, [logoUrl]);

  const hasValidLogo = Boolean(logoUrl) && !imgFailed;

  if (hasValidLogo) {
    return (
      <span className={`inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 ${className}`}>
        <img
          src={logoUrl}
          alt={platformName}
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className={imgClassName}
        />
        {showWordmarkWithImage && (
          <span className={`font-bold tracking-tight whitespace-nowrap ${textClassName}`}>
            {platformName}
          </span>
        )}
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center font-bold tracking-tight whitespace-nowrap shrink-0 ${textClassName} ${className}`}>
      {platformName}
    </span>
  );
}

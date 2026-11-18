import { useTranslation } from 'react-i18next';

export default function GlobalWatermark() {
  const { t } = useTranslation();

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-20 pointer-events-none overflow-hidden flex items-center justify-center select-none no-print"
    >
      <span className="-rotate-12 text-xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold tracking-tight text-center leading-tight px-6 max-w-[92vw] text-[#0B192C]/[0.045] dark:text-sky-200/[0.045]">
        {t('watermark.brandText')}
      </span>
    </div>
  );
}

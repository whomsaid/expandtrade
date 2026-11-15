import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Film, Loader2, Package } from 'lucide-react';
import { formatMoney } from '../utils/format.js';

export default function VideoAdPlayer({
  video,
  streamSrc,
  showBusiness = false,
  compact = false,
}) {
  const [buffering, setBuffering] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const src = streamSrc || video?.stream_url;
  if (!video || !src) return null;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
      <div className={`relative bg-slate-950 ${compact ? 'aspect-video' : 'aspect-video'}`}>
        {loadError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300 text-xs p-4 text-center gap-2">
            <Film className="w-6 h-6 text-slate-400" />
            <span>Unable to play this video stream right now.</span>
          </div>
        ) : (
          <video
            src={src}
            poster={video.thumbnail_url || undefined}
            controls
            preload="metadata"
            playsInline
            onLoadStart={() => setBuffering(true)}
            onWaiting={() => setBuffering(true)}
            onLoadedData={() => setBuffering(false)}
            onCanPlay={() => setBuffering(false)}
            onPlaying={() => setBuffering(false)}
            onError={() => {
              setBuffering(false);
              setLoadError(true);
            }}
            className="w-full h-full object-contain bg-black"
          />
        )}

        {buffering && !loadError && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/50">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/90 text-white text-xs font-medium">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Loading video...</span>
            </div>
          </div>
        )}
      </div>

      <div className="p-4 space-y-2 flex-1 flex flex-col justify-between">
        <div className="space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 line-clamp-1">{video.title}</h3>
          </div>
          {video.description && (
            <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">{video.description}</p>
          )}
        </div>

        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-2 min-w-0">
            {video.product_name && (
              <span className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-200 font-medium truncate">
                <Package className="w-3 h-3 text-sky-700 dark:text-sky-400 shrink-0" />
                <span className="truncate">{video.product_name}</span>
                {video.product_price !== null && video.product_price !== undefined && (
                  <span className="tabular-nums text-slate-500 dark:text-slate-400">
                    ({formatMoney(video.product_price, video.currency_code || 'RWF')})
                  </span>
                )}
              </span>
            )}
          </div>
          {showBusiness && video.business_slug && (
            <Link
              to={`/businesses/${video.business_slug}`}
              className="font-semibold text-sky-700 dark:text-sky-400 hover:underline whitespace-nowrap"
            >
              {video.business_name} →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

import React, { useRef, useState } from 'react';
import { Play } from 'lucide-react';
import { logEvent } from './services/analyticsService';

// Arquivos em public/video/: como-funciona.mp4 e poster.jpg (veja LEIA-ME.txt).
// Se o arquivo não existir, a seção some sozinha e a LP continua normal.
const VIDEO_MP4 = '/video/como-funciona.mp4';
const VIDEO_POSTER = '/video/poster.jpg';

const HeroVideo: React.FC = () => {
  const ref = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const [started, setStarted] = useState(false);
  const [posterOk, setPosterOk] = useState(true);

  if (failed) return null;

  const handlePlay = () => {
    const v = ref.current;
    if (!v) return;
    v.muted = false;
    v.play().catch(() => {});
  };

  return (
    <div className="mt-8 max-w-2xl mx-auto">
      <div className="relative aspect-video rounded-2xl overflow-hidden shadow-2xl border border-slate-200 bg-slate-900">
        <video
          ref={ref}
          className="w-full h-full object-cover"
          controls={started}
          playsInline
          preload="metadata"
          poster={posterOk ? VIDEO_POSTER : undefined}
          onPlay={() => {
            if (!started) logEvent('hero_video_play', {});
            setStarted(true);
          }}
          onEnded={() => logEvent('hero_video_complete', {})}
          src={VIDEO_MP4}
          onError={() => setFailed(true)}
        />
        {!started && (
          <button
            type="button"
            onClick={handlePlay}
            aria-label="Assistir vídeo: como funciona o AutoRecurso"
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-900/40 hover:bg-slate-900/30 transition-colors group"
          >
            <span className="flex items-center justify-center w-20 h-20 rounded-full bg-blue-600 text-white shadow-2xl group-hover:scale-110 transition-transform">
              <Play className="w-9 h-9 ml-1" fill="currentColor" />
            </span>
            <span className="px-4 py-1.5 rounded-full bg-white/90 text-slate-800 text-xs font-black uppercase tracking-wider">
              Veja como funciona em 1 minuto
            </span>
          </button>
        )}
      </div>
    </div>
  );
};

export default HeroVideo;

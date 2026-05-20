import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';

function getYouTubeEmbedUrl(url) {
  try {
    const u = new URL(url);
    const id = u.searchParams.get('v') || u.pathname.split('/').pop();
    return id ? `https://www.youtube.com/embed/${id}` : null;
  } catch { return null; }
}

const VideoPlayer = forwardRef(function VideoPlayer({ videoUrl, youtubeUrl, segments = [], onTimeUpdate }, ref) {
  const embedUrl = youtubeUrl ? getYouTubeEmbedUrl(youtubeUrl) : null;

  // All hooks must come before any conditional returns
  const videoRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentCaption, setCurrentCaption] = useState('');

  useImperativeHandle(ref, () => ({
    seekTo: (time) => {
      if (!videoRef.current) return;
      videoRef.current.currentTime = time;
      videoRef.current.play().catch(() => {});
    },
  }));

  // Update caption based on current time
  useEffect(() => {
    if (!segments.length) { setCurrentCaption(''); return; }
    const seg = segments.find(s => currentTime >= s.start && currentTime <= s.end);
    setCurrentCaption(seg?.text || '');
  }, [currentTime, segments]);

  useEffect(() => {
    if (embedUrl) return;
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpd = () => {
      setCurrentTime(video.currentTime);
      onTimeUpdate?.(video.currentTime);
    };
    const onMeta  = () => setDuration(video.duration);
    const onPlay  = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    video.addEventListener('timeupdate', onTimeUpd);
    video.addEventListener('loadedmetadata', onMeta);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    return () => {
      video.removeEventListener('timeupdate', onTimeUpd);
      video.removeEventListener('loadedmetadata', onMeta);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
    };
  }, [embedUrl, onTimeUpdate]);

  const handleSeek = (e) => {
    const video = videoRef.current;
    if (!video) return;
    const t = parseFloat(e.target.value);
    video.currentTime = t;
    setCurrentTime(t);
  };

  const handlePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  };

  const formatTime = (s) => {
    if (isNaN(s)) return '0:00';
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  };

  if (embedUrl) {
    return (
      <div className="w-full rounded-xl overflow-hidden bg-black" style={{ paddingTop: '56.25%', position: 'relative' }}>
        <iframe
          src={embedUrl}
          className="absolute inset-0 w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title="YouTube video"
        />
      </div>
    );
  }

  return (
    <div className="w-full rounded-xl overflow-hidden bg-black">
      <div className="relative">
        <video
          ref={videoRef}
          src={videoUrl}
          className="w-full"
          onClick={handlePlayPause}
          onError={(e) => console.error('Video error:', e.target.error)}
        />
        {/* Subtitle overlay */}
        {currentCaption && (
          <div className="absolute bottom-3 left-0 right-0 px-4 pointer-events-none">
            <div className="bg-black/80 text-white text-center py-1.5 px-4 rounded-lg max-w-2xl mx-auto text-sm leading-relaxed">
              {currentCaption}
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="bg-white px-4 py-3 space-y-2">
        <input
          type="range" min="0" max={duration || 0} value={currentTime}
          onChange={handleSeek}
          className="w-full h-1.5 appearance-none rounded-full cursor-pointer"
          style={{
            background: `linear-gradient(to right, #6366f1 0%, #6366f1 ${duration ? (currentTime / duration) * 100 : 0}%, #2a2a3e ${duration ? (currentTime / duration) * 100 : 0}%, #2a2a3e 100%)`
          }}
        />
        <div className="flex items-center gap-3">
          <button
            onClick={handlePlayPause}
            className="w-8 h-8 rounded-full bg-indigo-600 hover:bg-indigo-700 flex items-center justify-center transition flex-shrink-0"
          >
            {isPlaying ? (
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
          <span className="text-xs font-mono text-gray-500">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>
      </div>
    </div>
  );
});

export default VideoPlayer;

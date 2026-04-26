import { useState, useEffect, useRef } from 'react';

export default function VideoPlayer({ videoUrl, segments }) {
  const videoRef = useRef(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentCaption, setCurrentCaption] = useState('');
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const controlsTimeoutRef = useRef(null);

  // Update current time as video plays
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
    };

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
    };
  }, []);

  // Find and display current caption based on video time
  useEffect(() => {
    if (!segments || segments.length === 0) {
      setCurrentCaption('');
      return;
    }

    const currentSegment = segments.find(
      segment => currentTime >= segment.start && currentTime <= segment.end
    );

    setCurrentCaption(currentSegment ? currentSegment.text : '');
  }, [currentTime, segments]);

  const handlePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play();
    } else {
      video.pause();
    }
  };

  const handleSeek = (e) => {
    const video = videoRef.current;
    if (!video) return;

    const seekTime = parseFloat(e.target.value);
    video.currentTime = seekTime;
    setCurrentTime(seekTime);
  };

  const handleSegmentClick = (startTime) => {
    const video = videoRef.current;
    if (!video) return;

    video.currentTime = startTime;
    video.play();
  };

  const handleMouseMove = () => {
    setShowControls(true);
    
    // Clear existing timeout
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    
    // Hide controls after 3 seconds of no mouse movement (only when playing)
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
  };

  const handleMouseLeave = () => {
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 1000);
    }
  };

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, []);

  // Always show controls when paused
  useEffect(() => {
    if (!isPlaying) {
      setShowControls(true);
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    }
  }, [isPlaying]);

  const formatTime = (seconds) => {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Video Container */}
      <div 
        className="relative bg-black rounded-lg overflow-hidden shadow-lg"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* Video/Audio Element */}
        <video
          ref={videoRef}
          src={videoUrl}
          className="w-full cursor-pointer"
          controls={false}
          onClick={handlePlayPause}
        >
          Your browser does not support the video tag.
        </video>

        {/* Live Captions Overlay */}
        {currentCaption && (
          <div className="absolute bottom-16 left-0 right-0 px-4 pointer-events-none">
            <div className="bg-black bg-opacity-80 text-white text-center py-2 px-4 rounded-lg max-w-3xl mx-auto">
              <p className="text-lg font-medium leading-relaxed">
                {currentCaption}
              </p>
            </div>
          </div>
        )}

        {/* Custom Controls - Auto-hide */}
        <div 
          className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-4 transition-opacity duration-300 ${
            showControls ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {/* Progress Bar */}
          <input
            type="range"
            min="0"
            max={duration || 0}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer mb-3"
            style={{
              background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${(currentTime / duration) * 100}%, #4b5563 ${(currentTime / duration) * 100}%, #4b5563 100%)`
            }}
          />

          {/* Control Buttons */}
          <div className="flex items-center justify-between text-white">
            <div className="flex items-center gap-4">
              {/* Play/Pause Button */}
              <button
                onClick={handlePlayPause}
                className="bg-blue-600 hover:bg-blue-700 rounded-full p-3 transition-colors"
              >
                {isPlaying ? (
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>

              {/* Time Display */}
              <span className="text-sm font-mono">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            {/* Volume/Settings could go here */}
            <div className="text-xs text-gray-300">
              {segments?.length || 0} segments
            </div>
          </div>
        </div>
      </div>

      {/* Segment List - Click to jump to timestamp */}
      {segments && segments.length > 0 && (
        <div className="mt-6 bg-white rounded-lg shadow-md p-4 max-h-96 overflow-y-auto">
          <h3 className="text-lg font-semibold text-gray-800 mb-3">
            Transcript Segments (Click to jump)
          </h3>
          <div className="space-y-2">
            {segments.map((segment, index) => {
              const isActive = currentTime >= segment.start && currentTime <= segment.end;
              
              return (
                <button
                  key={index}
                  onClick={() => handleSegmentClick(segment.start)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    isActive
                      ? 'bg-blue-50 border-blue-500 shadow-sm'
                      : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className={`text-xs font-mono min-w-[120px] ${
                      isActive ? 'text-blue-600 font-semibold' : 'text-gray-500'
                    }`}>
                      {formatTime(segment.start)} → {formatTime(segment.end)}
                    </span>
                    <p className={`flex-1 ${
                      isActive ? 'text-gray-900 font-medium' : 'text-gray-700'
                    }`}>
                      {segment.text}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

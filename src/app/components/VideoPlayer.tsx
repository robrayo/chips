"use client";
import { useState, useRef, useEffect, useCallback } from 'react';
import { FaPlay, FaPause, FaExpand, FaCompress, FaVolumeUp, FaVolumeMute, FaBackward, FaForward } from 'react-icons/fa';
import axios from 'axios';

interface VideoPlayerProps {
  src: string;
  title: string;
  onClose: () => void;
  isOpen: boolean;
  availableStreams?: Array<Record<string, any>>;
  streamId?: string;
  subjectId?: string;
  season?: number;
  episode?: number;
}

// Helper function to extract quality information from stream object
const getStreamQuality = (stream: Record<string, any>, index?: number): string => {
  // Use 'resolutions' as the primary quality label
  if (stream.resolutions) {
    return stream.resolutions + 'p';
  }
  // Try other possible property names for quality (excluding 'size')
  const qualityProps = ['quality', 'label', 'resolution', 'height', 'width', 'name', 'title', 'bitrate'];
  for (const prop of qualityProps) {
    if (stream[prop]) {
      return String(stream[prop]);
    }
  }
  // Try to extract from URL
  if (stream.url) {
    const url = stream.url.toLowerCase();
    if (url.includes('1080p') || url.includes('1920x1080') || url.includes('1080')) return '1080p';
    if (url.includes('720p') || url.includes('1280x720') || url.includes('720')) return '720p';
    if (url.includes('480p') || url.includes('854x480') || url.includes('480')) return '480p';
    if (url.includes('360p') || url.includes('640x360') || url.includes('360')) return '360p';
    if (url.includes('240p') || url.includes('426x240') || url.includes('240')) return '240p';
  }
  // Fallback: use index to create meaningful labels
  if (index !== undefined) {
    const qualityLabels = ['Best', 'High', 'Medium', 'Low', 'Lowest'];
    const label = qualityLabels[index] || `Quality ${index + 1}`;
    return label;
  }
  return 'Auto';
};

// SRT to VTT conversion utility
function srtToVtt(srt: string): string {
  // Remove BOM if present
  srt = srt.replace(/^\uFEFF/, '');
  // Add WEBVTT header
  let vtt = 'WEBVTT\n\n';
  // Replace commas with periods in timecodes
  vtt += srt.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  return vtt;
}

// Robust SRT parser: handles \r\n, \n, BOM, and blocks with/without index
function parseSrt(srt: string) {
  const entries: any[] = [];
  if (!srt) return entries;
  // Remove BOM and normalize line endings
  srt = srt.replace(/^\uFEFF/, '').replace(/\r\n|\r/g, '\n');
  // Split into blocks by double newlines
  const blocks = srt.split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split('\n').filter(Boolean);
    if (lines.length < 2) continue;
    // If first line is a number, skip it
    let timeIdx = 0;
    if (/^\d+$/.test(lines[0])) timeIdx = 1;
    const timeMatch = lines[timeIdx]?.match(/(\d{2}:\d{2}:\d{2}),?(\d{3})?\s*-+>\s*(\d{2}:\d{2}:\d{2}),?(\d{3})?/);
    if (!timeMatch) continue;
    const start = toSeconds(timeMatch[1]) + (parseInt(timeMatch[2] || '0', 10) / 1000);
    const end = toSeconds(timeMatch[3]) + (parseInt(timeMatch[4] || '0', 10) / 1000);
    const text = lines.slice(timeIdx + 1).join('\n');
    if (text.trim()) entries.push({ start, end, text });
  }
  return entries;
}

function toSeconds(hms: string) {
  const [h, m, s] = hms.split(':').map(Number);
  return h * 3600 + m * 60 + s;
}

export default function VideoPlayer({ src, title, onClose, isOpen, availableStreams, streamId, subjectId, season = 0, episode = 0 }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [volume, setVolume] = useState(1);
  const [buffering, setBuffering] = useState(false);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [currentQuality, setCurrentQuality] = useState<string>("");
  const [currentStreamUrl, setCurrentStreamUrl] = useState<string>("");
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [captions, setCaptions] = useState<Array<any>>([]);
  const [srtCache, setSrtCache] = useState<{ [lang: string]: { entries: any[]; rawSrt?: string } }>({});
  const [currentSubtitle, setCurrentSubtitle] = useState<string>("");
  const [selectedCaption, setSelectedCaption] = useState<string | null>(null);
  const [showCCMenu, setShowCCMenu] = useState(false);
  const [subtitleSettings, setSubtitleSettings] = useState({
    fontSize: '1.25rem', // default 20px
    color: '#fff',
    background: 'rgba(0,0,0,0.6)'
  });
  const [showSubtitleSettings, setShowSubtitleSettings] = useState(false);

  useEffect(() => {
    console.log('useEffect triggered with:', { isOpen, availableStreams: availableStreams?.length, videoRef: !!videoRef.current });
    console.log('Full availableStreams:', availableStreams);
    
    if (isOpen && availableStreams && availableStreams.length > 0) {
      console.log('Available streams:', availableStreams);
      
      // Check if streams have URL property
      const streamsWithUrl = availableStreams.filter(stream => stream.url);
      console.log('Streams with URL:', streamsWithUrl);
      
      if (streamsWithUrl.length === 0) {
        console.error('No streams found with URL property');
        return;
      }
      
      // Initialize with the first (best quality) stream
      const bestStream = streamsWithUrl.sort((a, b) => {
        const qualityA = getStreamQuality(a);
        const qualityB = getStreamQuality(b);
        
        // Try to extract numeric values for sorting
        const numA = parseInt(qualityA.replace(/\D/g, '')) || 0;
        const numB = parseInt(qualityB.replace(/\D/g, '')) || 0;
        
        return numB - numA; // Highest quality first
      })[0];
      
      console.log('Best stream selected:', bestStream);
      
      const encodedUrl = encodeURIComponent(bestStream.url);
      const proxiedUrl = `/api/streaming-proxy?url=${encodedUrl}`;
      
      console.log('Setting video source to:', proxiedUrl);
      console.log('Original URL:', bestStream.url);
      
      setCurrentStreamUrl(proxiedUrl);
      setCurrentQuality(getStreamQuality(bestStream, 0));
      
      // Reset state when new video is loaded
      setCurrentTime(0);
      setDuration(0);
      setIsPlaying(false);
      setBuffering(false);
      setShowControls(true);
    } else {
      console.log('useEffect conditions not met:', { isOpen, hasStreams: !!availableStreams, streamCount: availableStreams?.length });
    }
  }, [isOpen, availableStreams]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      console.log('Video metadata loaded, duration:', video.duration);
      setDuration(video.duration || 0);
      setCurrentTime(0);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
    };

    const handlePlay = () => {
      console.log('Video started playing');
      setIsPlaying(true);
    };
    
    const handlePause = () => {
      console.log('Video paused');
      setIsPlaying(false);
    };
    
    const handleWaiting = () => {
      console.log('Video waiting/buffering');
      setBuffering(true);
    };
    
    const handleCanPlay = () => {
      console.log('Video can play');
      setBuffering(false);
    };
    
    const handleError = (e: Event) => {
      console.error('Video error:', e);
      console.error('Video error details:', video.error);
    };

    // Remove any existing listeners first
    video.removeEventListener('loadedmetadata', handleLoadedMetadata);
    video.removeEventListener('timeupdate', handleTimeUpdate);
    video.removeEventListener('play', handlePlay);
    video.removeEventListener('pause', handlePause);
    video.removeEventListener('waiting', handleWaiting);
    video.removeEventListener('canplay', handleCanPlay);
    video.removeEventListener('error', handleError);

    // Add new listeners
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('error', handleError);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('error', handleError);
    };
  }, [currentStreamUrl]);

  const togglePlay = useCallback(() => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
    }
  }, [isPlaying]);

  const toggleMute = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  }, [isMuted]);

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current;
    if (!document.fullscreenElement) {
      if (container && container.requestFullscreen) {
        container.requestFullscreen();
        setIsFullscreen(true);
      }
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.volume = newVolume;
      setVolume(newVolume);
      setIsMuted(newVolume === 0);
    }
  };

  const skipTime = useCallback((seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime += seconds;
    }
  }, []);

  const handleQualityChange = useCallback((stream: Record<string, any>) => {
    console.log('Stream object for quality change:', stream);
    if (videoRef.current && stream.url) {
      const currentTime = videoRef.current.currentTime;
      const wasPlaying = !videoRef.current.paused;
      
      // Find the stream index for quality labeling
      const streamIndex = availableStreams?.findIndex(s => s.url === stream.url) ?? 0;
      
      // Create proxied URL
      const encodedUrl = encodeURIComponent(stream.url);
      const proxiedUrl = `/api/streaming-proxy?url=${encodedUrl}`;
      
      setCurrentStreamUrl(proxiedUrl);
      setCurrentQuality(getStreamQuality(stream, streamIndex));
      setShowQualityMenu(false);
      
      // Update video source
      videoRef.current.src = proxiedUrl;
      videoRef.current.load();
      
      // Restore playback position and state
      videoRef.current.addEventListener('loadedmetadata', () => {
        videoRef.current!.currentTime = currentTime;
        if (wasPlaying) {
          videoRef.current!.play();
        }
      }, { once: true });
    }
  }, [availableStreams]);

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleMouseMove = () => {
    console.log('Mouse moved, showing controls');
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      console.log('Hiding controls after timeout');
      if (isPlaying) {
        setShowControls(false);
      }
    }, 3000);
  };

  const handleTouchStart = () => {
    console.log('Touch started, showing controls');
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
  };

  const handleTouchEnd = () => {
    console.log('Touch ended, setting timeout to hide controls');
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      console.log('Hiding controls after touch timeout');
      if (isPlaying) {
        setShowControls(false);
      }
    }, 3000);
  };

  const handleKeyPress = useCallback((e: KeyboardEvent) => {
    if (!isOpen) return;
    
    switch (e.key) {
      case ' ':
        e.preventDefault();
        togglePlay();
        break;
      case 'f':
        toggleFullscreen();
        break;
      case 'm':
        toggleMute();
        break;
      case 'ArrowLeft':
        skipTime(-10);
        break;
      case 'ArrowRight':
        skipTime(10);
        break;
      case 'Escape':
        if (isFullscreen) {
          toggleFullscreen();
        } else {
          console.log('Escape pressed, closing player');
          onClose();
        }
        break;
    }
  }, [isOpen, isFullscreen, togglePlay, toggleMute, toggleFullscreen, skipTime, onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyPress);
    return () => {
      document.removeEventListener('keydown', handleKeyPress);
    };
  }, [handleKeyPress]);

  useEffect(() => {
    if (!isOpen) {
      // Reset state when player closes
      setCurrentTime(0);
      setDuration(0);
      setIsPlaying(false);
      setBuffering(false);
      setShowControls(true);
      setVolume(1);
      setIsMuted(false);
      setIsFullscreen(false);
      setShowQualityMenu(false);
      setCurrentQuality("");
      setCurrentStreamUrl("");
    }
  }, [isOpen]);

  // Close quality menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showQualityMenu) {
        setShowQualityMenu(false);
      }
    };

    if (showQualityMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showQualityMenu]);

  // Set video source when currentStreamUrl changes
  useEffect(() => {
    if (currentStreamUrl && videoRef.current) {
      console.log('Setting video element source to:', currentStreamUrl);
      videoRef.current.src = currentStreamUrl;
      videoRef.current.load();
    }
  }, [currentStreamUrl]);

  // Fetch captions when streamId/subjectId/season/episode changes
  useEffect(() => {
    if (!isOpen || !streamId || !subjectId) {
      setCaptions([]);
      setSrtCache({});
      return;
    }
    const fetchCaptions = async () => {
      try {
        const res = await axios.get(`https://movapi.xyz/mbapi/captions/${streamId}/${subjectId}`, {
          params: { se: season, ep: episode }
        });
        const caps = res.data?.data?.captions || [];
        setCaptions(caps);
        // Pre-fetch SRT for all languages
        const cache: { [lang: string]: { entries: any[]; rawSrt?: string } } = {};
        await Promise.all(
          caps.map(async (cap: any) => {
            try {
              const srtRes = await axios.get(cap.url, { responseType: 'text' });
              const rawSrt = srtRes.data;
              const entries = parseSrt(rawSrt);
              cache[cap.lan] = { entries, rawSrt };
            } catch (e) {
              console.error('Failed to fetch/parse SRT for', cap.lan, cap.url, e);
            }
          })
        );
        setSrtCache(cache);
      } catch (e) {
        setCaptions([]);
        setSrtCache({});
      }
    };
    fetchCaptions();
  }, [isOpen, streamId, subjectId, season, episode]);

  // When captions change, set default selectedCaption to 'en' if available, otherwise null
  useEffect(() => {
    if (captions.length > 0) {
      const hasEn = captions.some(c => c.lan === 'en');
      setSelectedCaption(hasEn ? 'en' : null);
    } else {
      setSelectedCaption(null);
    }
  }, [captions]);

  // Custom subtitle overlay sync
  useEffect(() => {
    if (!isOpen || !selectedCaption || !srtCache[selectedCaption] || !videoRef.current) {
      setCurrentSubtitle("");
      return;
    }
    const video = videoRef.current;
    let raf: number;
    const updateSubtitle = () => {
      const time = video.currentTime;
      const entries = srtCache[selectedCaption]?.entries || [];
      const active = entries.find((e: any) => time >= e.start && time <= e.end);
      setCurrentSubtitle(active ? active.text.replace(/\n/g, '<br/>') : "");
      raf = requestAnimationFrame(updateSubtitle);
    };
    raf = requestAnimationFrame(updateSubtitle);
    return () => cancelAnimationFrame(raf);
  }, [isOpen, selectedCaption, srtCache, currentStreamUrl]);

  useEffect(() => {
    if (!showCCMenu) return;
    const close = () => setShowCCMenu(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [showCCMenu]);

  if (!isOpen) return null;

  return (
    <div ref={containerRef} className="fixed inset-0 z-50 bg-black">
      <div 
        className="relative w-full h-full"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => isPlaying && setShowControls(false)}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Video Element */}
        <video
          ref={videoRef}
          className="w-full h-full object-contain"
          src={currentStreamUrl || undefined}
          preload="metadata"
          onLoadStart={() => console.log('Video load started')}
          onCanPlay={() => console.log('Video can play')}
          onError={(e) => console.error('Video element error:', e)}
        />
        
        {/* Loading indicator when no stream URL */}
        {!currentStreamUrl && (
          <div className="absolute inset-0 flex items-center justify-center bg-black">
            <div className="text-white text-lg sm:text-2xl">Loading video...</div>
          </div>
        )}

        {/* Buffering Indicator */}
        {buffering && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="text-white text-lg sm:text-2xl">Loading...</div>
          </div>
        )}

        {/* Controls Overlay */}
        <div 
          className={`absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 transition-opacity duration-300 ${
            showControls ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {/* Top Bar */}
          <div className="absolute top-0 left-0 right-0 p-2 sm:p-4 flex items-center justify-between z-30">
            <button
              onClick={() => {
                console.log('X button clicked, calling onClose');
                onClose();
              }}
              className="text-white hover:text-gray-300 transition-colors text-2xl sm:text-3xl font-bold bg-black/50 hover:bg-black/70 rounded-full w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center backdrop-blur-sm"
              aria-label="Close video player"
            >
              ✕
            </button>
            <h1 className="text-white text-sm sm:text-lg font-semibold truncate max-w-[200px] sm:max-w-md">{title}</h1>
            <div className="w-10 h-10 sm:w-12"></div> {/* Spacer for centering */}
          </div>

          {/* Center Play/Pause Button */}
          <div className="absolute inset-0 flex items-center justify-center">
            <button
              onClick={togglePlay}
              className="bg-white/20 hover:bg-white/30 text-white rounded-full p-3 sm:p-4 transition-all duration-200 backdrop-blur-sm"
            >
              {isPlaying ? (
                <FaPause className="w-6 h-6 sm:w-8 sm:h-8" />
              ) : (
                <FaPlay className="w-6 h-6 sm:w-8 sm:h-8 ml-1" />
              )}
            </button>
          </div>

          {/* Bottom Controls */}
          <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-6">
            {/* Progress Bar */}
            <div className="mb-3 sm:mb-4">
              <input
                type="range"
                min="0"
                max={duration || 0}
                value={currentTime || 0}
                onChange={handleSeek}
                className="w-full h-1 sm:h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer video-slider"
                style={{
                  background: `linear-gradient(to right, #e50914 0%, #e50914 ${duration > 0 ? (currentTime / duration) * 100 : 0}%, #666 ${duration > 0 ? (currentTime / duration) * 100 : 0}%, #666 100%)`
                }}
              />
            </div>

            {/* Control Buttons */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 sm:gap-4">
                <button
                  onClick={togglePlay}
                  className="text-white hover:text-gray-300 transition-colors p-2"
                >
                  {isPlaying ? <FaPause className="w-4 h-4 sm:w-5 sm:h-5" /> : <FaPlay className="w-4 h-4 sm:w-5 sm:h-5" />}
                </button>

                <button
                  onClick={() => skipTime(-10)}
                  className="text-white hover:text-gray-300 transition-colors p-2"
                >
                  <FaBackward className="w-3 h-3 sm:w-4 sm:h-4" />
                </button>

                <button
                  onClick={() => skipTime(10)}
                  className="text-white hover:text-gray-300 transition-colors p-2"
                >
                  <FaForward className="w-3 h-3 sm:w-4 sm:h-4" />
                </button>

                <div className="flex items-center gap-1 sm:gap-2">
                  <button
                    onClick={toggleMute}
                    className="text-white hover:text-gray-300 transition-colors p-2"
                  >
                    {isMuted ? <FaVolumeMute className="w-3 h-3 sm:w-4 sm:h-4" /> : <FaVolumeUp className="w-3 h-3 sm:w-4 sm:h-4" />}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={volume}
                    onChange={handleVolumeChange}
                    className="w-16 sm:w-20 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer video-slider"
                  />
                </div>

                <div className="text-white text-xs sm:text-sm">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </div>
                
                {/* Quality Selection */}
                {availableStreams && availableStreams.length > 1 && (
                  <div className="relative">
                    <button
                      onClick={() => setShowQualityMenu(!showQualityMenu)}
                      className="text-white hover:text-gray-300 transition-colors text-xs sm:text-sm bg-black/50 px-2 sm:px-3 py-1 rounded"
                    >
                      {currentQuality || "Auto"}
                    </button>
                    
                    {showQualityMenu && (
                      <div className="absolute bottom-full right-0 mb-2 bg-black/90 border border-white/20 rounded-lg overflow-hidden z-40 min-w-[80px]">
                        {availableStreams.map((stream, index) => {
                          const streamQuality = getStreamQuality(stream, index);
                          return (
                            <button
                              key={index}
                              onClick={() => handleQualityChange(stream)}
                              className={`block w-full text-left px-3 sm:px-4 py-2 text-xs sm:text-sm hover:bg-white/20 transition-colors ${
                                streamQuality === currentQuality ? 'bg-white/20' : ''
                              }`}
                            >
                              {streamQuality}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* CC Selector */}
                {captions.length > 0 && (
                  <div className="relative flex items-center gap-1">
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        setShowQualityMenu(false);
                        setShowCCMenu((v: boolean) => !v);
                      }}
                      className="text-white hover:text-gray-300 transition-colors p-2 text-xs sm:text-sm bg-black/50 rounded"
                      aria-label="Select captions"
                    >
                      {selectedCaption
                        ? (captions.find(c => c.lan === selectedCaption)?.lanName || selectedCaption)
                        : 'CC'}
                    </button>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        setShowSubtitleSettings(v => !v);
                      }}
                      className="text-white hover:text-gray-300 transition-colors p-2 text-xs sm:text-sm bg-black/50 rounded"
                      aria-label="Subtitle settings"
                      title="Subtitle settings"
                    >
                      ⚙️
                    </button>
                    {showCCMenu && (
                      <div className="absolute bottom-full left-0 mb-2 bg-black/90 border-2 border-red-500 rounded-lg overflow-hidden z-50 min-w-[120px]" style={{ pointerEvents: 'auto' }}>
                        <button
                          className={`block w-full text-left px-3 sm:px-4 py-2 text-xs sm:text-sm hover:bg-white/20 transition-colors ${selectedCaption === null ? 'bg-white/20' : ''}`}
                          onClick={() => { setSelectedCaption(null); setShowCCMenu(false); }}
                        >
                          Off
                        </button>
                        {captions.map((caption, idx) => {
                          const lan = caption.lan || String(idx);
                          return (
                            <button
                              key={caption.id || lan}
                              className={`block w-full text-left px-3 sm:px-4 py-2 text-xs sm:text-sm hover:bg-white/20 transition-colors ${selectedCaption === lan ? 'bg-white/20' : ''}`}
                              onMouseDown={() => {
                                setSelectedCaption(lan);
                                setShowCCMenu(false);
                              }}
                            >
                              {caption.lanName || lan}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {showSubtitleSettings && (
                      <div className="absolute bottom-full left-12 mb-2 bg-black/90 border-2 border-blue-500 rounded-lg overflow-hidden z-50 min-w-[220px] p-4 flex flex-col gap-3" style={{ pointerEvents: 'auto' }}>
                        <label className="flex flex-col text-xs text-white gap-1">
                          Font Size
                          <input
                            type="range"
                            min="0.75"
                            max="2.5"
                            step="0.05"
                            value={parseFloat(subtitleSettings.fontSize)}
                            onChange={e => setSubtitleSettings(s => ({ ...s, fontSize: e.target.value + 'rem' }))}
                          />
                          <span>{subtitleSettings.fontSize}</span>
                        </label>
                        <label className="flex flex-col text-xs text-white gap-1">
                          Font Color
                          <input
                            type="color"
                            value={subtitleSettings.color}
                            onChange={e => setSubtitleSettings(s => ({ ...s, color: e.target.value }))}
                          />
                        </label>
                        <label className="flex flex-col text-xs text-white gap-1">
                          Background
                          <input
                            type="color"
                            value={subtitleSettings.background.startsWith('rgba') ? '#000000' : subtitleSettings.background}
                            onChange={e => setSubtitleSettings(s => ({ ...s, background: e.target.value }))}
                          />
                          <span className="flex gap-2 mt-1">
                            <button
                              className={`px-2 py-1 rounded ${subtitleSettings.background === 'rgba(0,0,0,0.6)' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-white'}`}
                              onClick={() => setSubtitleSettings(s => ({ ...s, background: 'rgba(0,0,0,0.6)' }))}
                              type="button"
                            >
                              Default
                            </button>
                            <button
                              className={`px-2 py-1 rounded ${subtitleSettings.background === 'transparent' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-white'}`}
                              onClick={() => setSubtitleSettings(s => ({ ...s, background: 'transparent' }))}
                              type="button"
                            >
                              None
                            </button>
                          </span>
                        </label>
                        <button
                          className="mt-2 px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                          onClick={() => setShowSubtitleSettings(false)}
                        >
                          Close
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <button
                onClick={toggleFullscreen}
                className="text-white hover:text-gray-300 transition-colors p-2"
              >
                {isFullscreen ? <FaCompress className="w-4 h-4 sm:w-5 sm:h-5" /> : <FaExpand className="w-4 h-4 sm:w-5 sm:h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Custom Subtitle Overlay */}
        {isOpen && (
          <div
            className="absolute left-0 w-full flex justify-center pointer-events-none select-none z-50"
            style={{
              bottom: '0.5rem', // just above the controls (approx 56px)
              textShadow: '0 2px 4px #000, 0 0 2px #000'
            }}
          >
            {selectedCaption && !srtCache[selectedCaption] && (
              <span className="bg-black/80 text-red-400 text-base sm:text-xl px-4 py-2 rounded-lg max-w-2xl text-center">
                Failed to load subtitles for selected language.
              </span>
            )}
            {selectedCaption && srtCache[selectedCaption]?.entries?.length === 0 && (
              <span className="bg-black/80 text-yellow-300 text-base sm:text-xl px-4 py-2 rounded-lg max-w-2xl text-center">
                No subtitles available for this language.<br/>
                <span className="block text-xs text-white/80 mt-2">Raw SRT (first 500 chars):<br/>{srtCache[selectedCaption]?.rawSrt?.slice?.(0, 500) || 'N/A'}</span>
              </span>
            )}
            {currentSubtitle && (
              <span
                className="bg-black/60 text-white text-base sm:text-xl px-4 py-2 rounded-lg max-w-2xl text-center"
                style={{
                  lineHeight: '1.4',
                  display: 'inline-block',
                  fontSize: subtitleSettings.fontSize,
                  color: subtitleSettings.color,
                  background: subtitleSettings.background
                }}
                dangerouslySetInnerHTML={{ __html: currentSubtitle }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
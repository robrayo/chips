"use client";
import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { useParams, useRouter } from "next/navigation";
import { FaChevronDown, FaChevronUp, FaTv, FaRegCalendarAlt, FaPlay } from "react-icons/fa";
import VideoPlayer from "../../components/VideoPlayer";
import dynamic from "next/dynamic";

const TMDB_API_KEY = "74b2f82e5df3287da1bd41e79bca1185";
const TMDB_IMAGE_HD_BASE = "https://image.tmdb.org/t/p/original";
const TopNavDrawer = dynamic(() => import("../../components/TopNavDrawer"), { ssr: false });

// Function to get streaming source URL
async function getStreamingSource(detailPath: string, subjectId: string, se: number = 0, ep: number = 0) {
  try {
    const response = await axios.get(`https://movapi.xyz/mbapi/source/${detailPath}/${subjectId}`, {
      params: { se, ep }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching streaming source:', error);
    throw error;
  }
}

// Function to get best quality stream URL
function getBestQualityStream(streams: any[]) {
  if (!streams || streams.length === 0) return null;
  
  // Sort by resolution (highest first) and return the best quality
  const sortedStreams = streams.sort((a, b) => {
    const resA = parseInt(a.resolutions) || 0;
    const resB = parseInt(b.resolutions) || 0;
    return resB - resA;
  });
  
  return sortedStreams[0];
}

// Function to convert streaming URL to use proxy
function getProxiedStreamUrl(originalUrl: string) {
  if (!originalUrl) return null;
  
  // Encode the original URL to pass as a query parameter
  const encodedUrl = encodeURIComponent(originalUrl);
  return `/api/streaming-proxy?url=${encodedUrl}`;
}

export default function DetailPage() {
  const { detailPath } = useParams();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [tmdb, setTmdb] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [trailerKey, setTrailerKey] = useState<string | null>(null);
  const [expandedSeasons, setExpandedSeasons] = useState<Record<number, boolean>>({});
  const [streamingLoading, setStreamingLoading] = useState(false);
  const [streamingError, setStreamingError] = useState("");
  const [streamingUrl, setStreamingUrl] = useState<string | null>(null);
  const [playerOpen, setPlayerOpen] = useState(false);
  const [playerTitle, setPlayerTitle] = useState("");
  const [availableStreams, setAvailableStreams] = useState<Array<Record<string, any>>>([]);
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [playerStreamId, setPlayerStreamId] = useState<string | undefined>(undefined);
  const [playerSeason, setPlayerSeason] = useState<number>(0);
  const [playerEpisode, setPlayerEpisode] = useState<number>(0);

  // Get subjectId from URL query parameters
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const subjectIdParam = urlParams.get('subjectId');
    setSubjectId(subjectIdParam);
  }, []);

  useEffect(() => {
    if (!detailPath) return;
    setLoading(true);
    setError(null);
    setData(null);
    setTmdb(null);
    axios.get(`https://movapi.xyz/mbapi/seasons/${detailPath}`)
      .then(async res => {
        if (!res.data) {
          setError("No data found for this title.");
          setLoading(false);
          return;
        }
        setData(res.data);
        // Try to fetch TMDB details by title
        const title = res.data.title;
        try {
          // Try TV search first
          let tmdbRes = await axios.get(`https://api.themoviedb.org/3/search/tv`, {
            params: { api_key: TMDB_API_KEY, query: title }
          });
          let tmdbShow = tmdbRes.data.results && tmdbRes.data.results.length > 0 ? tmdbRes.data.results[0] : null;
          let isMovie = false;
          if (!tmdbShow) {
            // Fallback to movie search
            tmdbRes = await axios.get(`https://api.themoviedb.org/3/search/movie`, {
              params: { api_key: TMDB_API_KEY, query: title }
            });
            if (tmdbRes.data.results && tmdbRes.data.results.length > 0) {
              tmdbShow = tmdbRes.data.results[0];
              isMovie = true;
            }
          }
          if (tmdbShow) {
            setTmdb(tmdbShow);
            // Fetch videos for trailer
            try {
              const videoRes = await axios.get(`https://api.themoviedb.org/3/${isMovie ? 'movie' : 'tv'}/${tmdbShow.id}/videos`, {
                params: { api_key: TMDB_API_KEY }
              });
              const trailer = videoRes.data.results?.find((v: any) => v.site === 'YouTube' && v.type === 'Trailer');
              if (trailer) {
                setTrailerKey(trailer.key);
              }
            } catch (e) {
              // Ignore video errors
            }
          }
        } catch (e) {
          // Ignore TMDB errors, fallback to mbapi data
        }
        setLoading(false);
      })
      .catch((err) => {
        setError("Failed to fetch details.");
        setLoading(false);
        console.error(err);
      });
  }, [detailPath]);

  if (error) {
    return <div className="min-h-screen flex items-center justify-center text-red-500 text-xl">{error}</div>;
  }
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-neutral-400 text-xl">Loading...</div>;
  }
  if (!data) {
    return <div className="min-h-screen flex items-center justify-center text-red-500 text-xl">No data found for this title.</div>;
  }

  // Prefer TMDB details if available
  const title = tmdb?.name || data.title;
  const description = tmdb?.overview || data.description;
  let backdrop = data.image;
  if (tmdb?.backdrop_path) {
    backdrop = `${TMDB_IMAGE_HD_BASE}${tmdb.backdrop_path}`;
  }

  // Get season posters from TMDB if available
  const tmdbSeasons = tmdb?.seasons || [];

  async function handleMovieStreaming() {
    if (!detailPath || !subjectId) {
      setStreamingError("Streaming information not available");
      return;
    }

    setStreamingLoading(true);
    setStreamingError("");
    setStreamingUrl(null);
    setAvailableStreams([]);
    setPlayerStreamId(undefined);
    setPlayerSeason(0);
    setPlayerEpisode(0);

    try {
      // For movies: /mbapi/source/:detailPath/:subjectId?se=0&ep=0
      const streamingData = await getStreamingSource(detailPath as string, subjectId, 0, 0);
      
      if (streamingData && streamingData.data && streamingData.data.streams && streamingData.data.streams.length > 0) {
        setAvailableStreams(streamingData.data.streams);
        setPlayerTitle(title);
        setPlayerStreamId(streamingData.data.streams[0]?.id);
        console.log("Opening player with streams:", streamingData.data.streams.length);
        setPlayerOpen(true);
      } else {
        setStreamingError("No streaming streams available");
      }
    } catch (error) {
      setStreamingError("Failed to fetch streaming URL");
    } finally {
      setStreamingLoading(false);
    }
  }

  async function handleEpisodeStreaming(seasonNumber: number, episodeNumber: number) {
    if (!detailPath || !subjectId) {
      setStreamingError("Streaming information not available");
      return;
    }

    setStreamingLoading(true);
    setStreamingError("");
    setStreamingUrl(null);
    setAvailableStreams([]);
    setPlayerStreamId(undefined);
    setPlayerSeason(seasonNumber);
    setPlayerEpisode(episodeNumber);

    try {
      // For TV shows: /mbapi/source/:detailPath/:subjectId?se={season}&ep={episode}
      const streamingData = await getStreamingSource(detailPath as string, subjectId, seasonNumber, episodeNumber);
      
      if (streamingData && streamingData.data && streamingData.data.streams && streamingData.data.streams.length > 0) {
        setAvailableStreams(streamingData.data.streams);
        setPlayerTitle(`${title} - S${seasonNumber}E${episodeNumber}`);
        setPlayerStreamId(streamingData.data.streams[0]?.id);
        console.log("Opening player with streams:", streamingData.data.streams.length);
        setPlayerOpen(true);
      } else {
        setStreamingError("No streaming streams available");
      }
    } catch (error) {
      setStreamingError("Failed to fetch streaming URL");
    } finally {
      setStreamingLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <TopNavDrawer />
      {/* Top Navigation Bar */}
      <nav className="w-full bg-black/80 border-b border-gray-800 flex items-center justify-center py-3 px-4 z-50 sticky top-0">
        <div className="flex gap-6 text-lg font-semibold">
          <a href="/" className="hover:text-red-500 transition-colors">Home</a>
          <a href="/tv" className="hover:text-red-500 transition-colors">TV Shows</a>
          <a href="/movies" className="hover:text-red-500 transition-colors">Movies</a>
        </div>
      </nav>
      {/* Header */}
      <header className="relative h-[200px] sm:h-[300px] md:h-[400px] overflow-hidden">
        <div 
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${backdrop})` }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />
        </div>
        <div className="absolute inset-0 flex items-end p-4 sm:p-8">
          <div className="max-w-4xl">
            <h1 className="text-2xl sm:text-4xl md:text-5xl font-bold mb-2 sm:mb-4">{title}</h1>
            <p className="text-sm sm:text-base md:text-lg text-gray-300 mb-4 sm:mb-6 line-clamp-2 sm:line-clamp-3">{description}</p>
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
              {/* Play button for movies (no valid seasons with episodes) */}
              {(
                !data.seasons ||
                data.seasons.length === 0 ||
                data.seasons.every((season: any) => {
                  // Consider a season invalid if it has no episodes or episodes.length === 0
                  const episodes = season.episodes;
                  return !episodes || (Array.isArray(episodes) && episodes.length === 0);
                })
              ) && (
                <button
                  onClick={handleMovieStreaming}
                  className="bg-red-600 hover:bg-red-700 text-white font-bold px-4 sm:px-8 py-2 sm:py-3 rounded flex items-center justify-center gap-2 text-sm sm:text-lg transition"
                  disabled={streamingLoading}
                >
                  <FaPlay className="w-4 h-4 sm:w-5 sm:h-5" />
                  {streamingLoading ? 'Loading...' : 'Play'}
                </button>
              )}
              {trailerKey && (
                <button
                  onClick={() => window.open(`https://www.youtube.com/watch?v=${trailerKey}`, '_blank')}
                  className="bg-gray-700/80 text-white font-bold px-4 sm:px-8 py-2 sm:py-3 rounded flex items-center justify-center gap-2 text-sm sm:text-lg hover:bg-gray-600 transition"
                >
                  <FaTv className="w-4 h-4 sm:w-5 sm:h-5" />
                  Watch Trailer
                </button>
              )}
            </div>
            {streamingError && (
              <div className="text-red-400 text-sm sm:text-base mt-2">{streamingError}</div>
            )}
          </div>
        </div>
        <button
          onClick={() => router.back()}
          className="absolute top-4 left-4 text-white hover:text-gray-300 transition-colors text-2xl sm:text-3xl font-bold bg-black/50 hover:bg-black/70 rounded-full w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center backdrop-blur-sm"
        >
          ←
        </button>
      </header>

      {/* Content */}
      <main className="p-4 sm:p-8">
        {/* Seasons/Episodes */}
        {data.seasons && data.seasons.length > 0 && (() => {
          const validSeasons = data.seasons.filter((season: any) => {
            const seasonNum = season.season || season.seasonNumber || season.season_number || season.number;
            return seasonNum > 0;
          });
          
          if (validSeasons.length === 0) {
            return (
              <div className="mb-8 sm:mb-12">
                <h2 className="text-xl sm:text-2xl font-semibold mb-4 sm:mb-6 border-l-4 border-red-600 pl-3 sm:pl-4">Episodes</h2>
                <div className="text-center py-8 text-gray-400">
                  <p className="text-lg mb-2">No episodes available</p>
                  <p className="text-sm">This might be a movie or the episode data is not available.</p>
                </div>
              </div>
            );
          }
          
          return (
            <div className="mb-8 sm:mb-12">
              <h2 className="text-xl sm:text-2xl font-semibold mb-4 sm:mb-6 border-l-4 border-red-600 pl-3 sm:pl-4">Episodes</h2>
              {validSeasons.map((season: any, seasonIndex: number) => {
                return (
                  <div key={seasonIndex} className="mb-6 sm:mb-8">
                    <button
                      onClick={() => {
                        console.log('Season button clicked:', seasonIndex);
                        console.log('Current expanded state:', expandedSeasons);
                        setExpandedSeasons(prev => {
                          const newState = { ...prev, [seasonIndex]: !prev[seasonIndex] };
                          console.log('New expanded state:', newState);
                          return newState;
                        });
                      }}
                      className="w-full flex items-center justify-between p-3 sm:p-4 bg-gray-800/50 rounded-lg hover:bg-gray-700/50 transition"
                    >
                      <div className="flex items-center gap-3 sm:gap-4">
                        <div className="w-12 h-12 sm:w-16 sm:h-16 rounded overflow-hidden flex-shrink-0">
                          {tmdbSeasons[seasonIndex]?.poster_path ? (
                            <img
                              src={`https://image.tmdb.org/t/p/w200${tmdbSeasons[seasonIndex].poster_path}`}
                              alt={`Season ${season.seasonNumber}`}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full bg-gray-600 flex items-center justify-center">
                              <FaTv className="w-6 h-6 text-gray-400" />
                            </div>
                          )}
                        </div>
                        <div className="text-left">
                          <h3 className="text-base sm:text-lg font-semibold">
                            Season {season.season || season.seasonNumber || season.season_number || season.number || 'Unknown'}
                          </h3>
                          <p className="text-sm text-gray-400">
                            {Array.isArray(season.episodes) ? season.episodes.length : (season.episodes || 0)} episodes
                          </p>
                        </div>
                      </div>
                      {expandedSeasons[seasonIndex] ? (
                        <FaChevronUp className="w-5 h-5 text-gray-400" />
                      ) : (
                        <FaChevronDown className="w-5 h-5 text-gray-400" />
                      )}
                    </button>
                    
                    {expandedSeasons[seasonIndex] && (
                      <div className="mt-3 sm:mt-4 grid gap-2 sm:gap-3">
                        {Array.isArray(season.episodes) ? (
                          season.episodes.map((episode: any, episodeIndex: number) => (
                            <button
                              key={episodeIndex}
                              onClick={() => {
                                const seasonNum = season.season || season.seasonNumber || season.season_number || season.number;
                                handleEpisodeStreaming(seasonNum, episode.episodeNumber);
                              }}
                              disabled={streamingLoading}
                              className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 bg-gray-800/30 rounded-lg hover:bg-gray-700/30 transition disabled:opacity-50 text-left"
                            >
                              <div className="w-8 h-8 sm:w-12 sm:h-12 bg-red-600 rounded flex items-center justify-center flex-shrink-0">
                                <FaPlay className="w-3 h-3 sm:w-4 sm:h-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="text-sm sm:text-base font-medium truncate">
                                  {episode.episodeNumber}. {episode.title}
                                </h4>
                                <p className="text-xs sm:text-sm text-gray-400 line-clamp-2">
                                  {episode.description || "No description available"}
                                </p>
                              </div>
                              <div className="text-xs sm:text-sm text-gray-500 flex items-center gap-1">
                                <FaRegCalendarAlt className="w-3 h-3" />
                                {episode.releaseDate ? new Date(episode.releaseDate).getFullYear() : "N/A"}
                              </div>
                            </button>
                          ))
                        ) : (
                          // Fallback: create episode buttons based on episode count
                          Array.from({ length: season.episodes || 0 }, (_, episodeIndex) => (
                            <button
                              key={episodeIndex}
                              onClick={() => {
                                const seasonNum = season.season || season.seasonNumber || season.season_number || season.number;
                                handleEpisodeStreaming(seasonNum, episodeIndex + 1);
                              }}
                              disabled={streamingLoading}
                              className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 bg-gray-800/30 rounded-lg hover:bg-gray-700/30 transition disabled:opacity-50 text-left"
                            >
                              <div className="w-8 h-8 sm:w-12 sm:h-12 bg-red-600 rounded flex items-center justify-center flex-shrink-0">
                                <FaPlay className="w-3 h-3 sm:w-4 sm:h-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="text-sm sm:text-base font-medium truncate">
                                  Episode {episodeIndex + 1}
                                </h4>
                                <p className="text-xs sm:text-sm text-gray-400 line-clamp-2">
                                  No description available
                                </p>
                              </div>
                              <div className="text-xs sm:text-sm text-gray-500 flex items-center gap-1">
                                <FaRegCalendarAlt className="w-3 h-3" />
                                N/A
                              </div>
                            </button>
                          ))
                        )}
                        {(!season.episodes || (Array.isArray(season.episodes) && season.episodes.length === 0) || (!Array.isArray(season.episodes) && !season.episodes)) && (
                          <div className="text-center py-4 text-gray-400">
                            No episodes available for this season
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* Movie Info */}
        {(!data.seasons || data.seasons.length === 0) && (
          <div className="mb-8 sm:mb-12">
            <h2 className="text-xl sm:text-2xl font-semibold mb-4 sm:mb-6 border-l-4 border-red-600 pl-3 sm:pl-4">Movie Information</h2>
            <div className="bg-gray-800/30 rounded-lg p-4 sm:p-6">
              <div className="grid gap-4 sm:gap-6 text-sm sm:text-base">
                <div>
                  <span className="text-gray-400">Release Date: </span>
                  <span>{data.releaseDate ? new Date(data.releaseDate).toLocaleDateString() : "Unknown"}</span>
                </div>
                {data.genre && (
                  <div>
                    <span className="text-gray-400">Genres: </span>
                    <span>{data.genre}</span>
                  </div>
                )}
                {data.imdbRatingValue && (
                  <div>
                    <span className="text-gray-400">IMDB Rating: </span>
                    <span>{data.imdbRatingValue}/10</span>
                  </div>
                )}
                {data.description && (
                  <div>
                    <span className="text-gray-400">Description: </span>
                    <p className="mt-2 text-gray-300 leading-relaxed">{data.description}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      <VideoPlayer
        src={streamingUrl || ""}
        title={playerTitle}
        isOpen={playerOpen}
        onClose={() => setPlayerOpen(false)}
        availableStreams={availableStreams}
        streamId={playerStreamId}
        subjectId={subjectId || undefined}
        season={playerSeason}
        episode={playerEpisode}
      />
    </div>
  );
}
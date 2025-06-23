"use client";
import Image from "next/image";
import { useEffect, useState, useRef } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";
import VideoPlayer from "./components/VideoPlayer";
import dynamic from "next/dynamic";

const TMDB_API_KEY = "74b2f82e5df3287da1bd41e79bca1185"; // User-provided key
const TMDB_API_URL = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500";
const TMDB_IMAGE_HD_BASE = "https://image.tmdb.org/t/p/original";

const TopNavDrawer = dynamic(() => import("./components/TopNavDrawer"), { ssr: false });

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
function getBestQualityStream(streams: Array<{ url: string; quality?: string; label?: string }>) {
  if (!streams || streams.length === 0) return null;
  
  // Sort by resolution (highest first) and return the best quality
  const sortedStreams = streams.sort((a, b) => {
    const resA = parseInt(a.quality || "0") || 0;
    const resB = parseInt(b.quality || "0") || 0;
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

export default function Home() {
  const [featured, setFeatured] = useState<Array<Record<string, unknown>>>([]);
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [suggestions, setSuggestions] = useState<Array<Record<string, unknown>>>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);
  const [playerOpen, setPlayerOpen] = useState(false);
  const [playerTitle, setPlayerTitle] = useState("");
  const [streamingUrl, setStreamingUrl] = useState<string | null>(null);
  const [availableStreams, setAvailableStreams] = useState<Array<{ url: string; quality?: string; label?: string, id?: string }>>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchDropdownOpen, setSearchDropdownOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [playerStreamId, setPlayerStreamId] = useState<string | undefined>(undefined);
  const [playerSubjectId, setPlayerSubjectId] = useState<string | undefined>(undefined);
  const [playerSeason, setPlayerSeason] = useState<number>(0);
  const [playerEpisode, setPlayerEpisode] = useState<number>(0);

  useEffect(() => {
    async function fetchFeatured() {
      try {
        const res = await axios.get('https://movapi.xyz/mbapi/ranking-list/1232643093049001320');
        setFeatured(res.data.data.subjectList.slice(0, 6) || []);
      } catch {
        setFeatured([]);
      }
    }
    fetchFeatured();
  }, []);

  useEffect(() => {
    async function fetchSuggestions() {
      try {
        const res = await axios.get("https://movapi.xyz/mbapi/suggestions");
        setSuggestions(res.data.data.subjectList.slice(0, 12));
      } catch {
        setSuggestions([]);
      } finally {
        setLoadingSuggestions(false);
      }
    }
    fetchSuggestions();
  }, []);

  // Search handler
  useEffect(() => {
    if (!searchTerm) {
      setSearchResults([]);
      setSearchDropdownOpen(false);
      return;
    }
    setSearchLoading(true);
    setSearchDropdownOpen(true);
    const fetchSearch = setTimeout(async () => {
      try {
        // Use custom mbapi search
        const res = await axios.get(`https://movapi.xyz/mbapi/search`, { params: { keyword: searchTerm } });
        // The API returns: { data: { items: [...] } }
        const results = res.data?.data?.items || [];
        setSearchResults(results.slice(0, 10));
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 400); // Debounce
    return () => clearTimeout(fetchSearch);
  }, [searchTerm]);

  // Main streaming handler that can be called from anywhere
  async function handleStreaming(detailPath: string, subjectId: string, title: string, opts?: { season?: number, episode?: number }) {
    console.log("handleStreaming called with:", { detailPath, subjectId, title, opts });
    setStreamingUrl(null);
    setAvailableStreams([]);
    setPlayerStreamId(undefined);
    setPlayerSubjectId(subjectId);
    setPlayerSeason(opts?.season ?? 0);
    setPlayerEpisode(opts?.episode ?? 0);

    try {
      const streamingData = await getStreamingSource(detailPath, subjectId, opts?.season ?? 0, opts?.episode ?? 0);
      
      if (streamingData && streamingData.data && streamingData.data.streams && streamingData.data.streams.length > 0) {
        setAvailableStreams(streamingData.data.streams);
        setPlayerTitle(title);
        setPlayerStreamId(streamingData.data.streams[0]?.id);
        
        // Set initial URL (will be overridden by VideoPlayer with best quality)
        const bestStream = getBestQualityStream(streamingData.data.streams);
        if (bestStream && bestStream.url) {
          const proxiedUrl = getProxiedStreamUrl(bestStream.url);
          setStreamingUrl(proxiedUrl);
        }
        
        console.log("Opening player with streams:", streamingData.data.streams.length);
        setPlayerOpen(true);
      } else {
        console.error("No streaming streams available");
      }
    } catch (error) {
      console.error("Failed to fetch streaming URL:", error);
    }
  }

  // Show at least 6 featured slides from trending
  const featuredSlides = featured;
  const currentFeatured = featuredSlides[featuredIndex] || null;

  // Auto-slide effect
  useEffect(() => {
    if (featuredSlides.length < 2) return;
    const interval = setInterval(() => {
      setFeaturedIndex((prev) => (prev === featuredSlides.length - 1 ? 0 : prev + 1));
    }, 5000);
    return () => clearInterval(interval);
  }, [featuredSlides.length]);

  return (
    <div className="min-h-screen bg-black text-white font-sans">
      <TopNavDrawer />
      <header className="flex items-center justify-between px-4 sm:px-8 py-4 sm:py-6 bg-gradient-to-b from-black/90 via-black/70 to-transparent sticky top-0 z-20">
        <div className="flex items-center gap-4 sm:gap-8">
          <span className="text-2xl sm:text-4xl font-extrabold tracking-widest text-red-600 drop-shadow-lg select-none">CHIPSFLIX</span>
          <nav className="hidden lg:flex gap-4 sm:gap-6 text-sm sm:text-lg font-semibold text-white/80">
            <a href="/" className="hover:text-white transition">Home</a>
            <a href="/tv" className="hover:text-white transition">TV Shows</a>
            <a href="/movies" className="hover:text-white transition">Movies</a>
            <a href="/anime" className="hover:text-white transition">Anime</a>
          </nav>
        </div>
        <div className="flex items-center gap-2 sm:gap-4 relative">
          {/* Search Bar */}
          <div className="relative">
            <input
              ref={searchInputRef}
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search movies, TV shows..."
              className="bg-neutral-800 text-white rounded-full px-4 py-2 w-40 sm:w-64 focus:outline-none focus:ring-2 focus:ring-red-600 placeholder:text-neutral-400"
              onFocus={() => searchTerm && setSearchDropdownOpen(true)}
              onClick={() => { console.log('[SEARCH INPUT] clicked'); }}
            />
            {searchDropdownOpen && (
              <div
                className="absolute left-0 mt-2 w-full bg-neutral-900 border border-neutral-700 rounded-lg shadow-lg z-50 max-h-96 overflow-y-hidden"
                onClick={() => { console.log('[SEARCH DROPDOWN] clicked'); }}
                style={{ pointerEvents: 'auto', zIndex: 9999, border: '3px solid red' }}
              >
                {searchLoading ? (
                  <div className="p-4 text-center text-neutral-400">Searching...</div>
                ) : searchResults.length === 0 ? (
                  <div className="p-4 text-center text-neutral-400">No results found.</div>
                ) : (
                  searchResults.map((result, idx) => (
                    <div
                      key={result.subjectId}
                      className="flex items-center gap-3 px-4 py-2 hover:bg-neutral-800 cursor-pointer"
                      onClick={() => {
                        setSearchDropdownOpen(false);
                        setSearchTerm("");
                        console.log("[SEARCH CLICK] result:", result);
                        const url = `/detail/${result.detailPath}?subjectId=${result.subjectId}`;
                        console.log("[SEARCH CLICK] Navigating to:", url);
                        try {
                          router.push(url);
                        } catch (e) {
                          console.error("router.push failed", e);
                          alert("Navigation failed: " + url);
                        }
                      }}
                    >
                      <img
                        src={result.cover?.url || "/netflix-logo.png"}
                        alt={result.title}
                        className="w-10 h-14 object-cover rounded"
                      />
                      <div>
                        <div className="font-semibold text-sm line-clamp-1">{result.title}</div>
                        <div className="text-xs text-neutral-400">{result.subjectType === 2 ? "TV Show" : "Movie"}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
          <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-neutral-700 flex items-center justify-center text-white font-bold text-sm sm:text-base">U</div>
        </div>
      </header>
      <main className="flex flex-col items-center justify-center px-2 sm:px-4">
        {/* Featured Content Slider */}
        {currentFeatured && (
          <section className="w-full max-w-5xl mb-8 sm:mb-12 relative group">
            <div className="relative h-[250px] sm:h-[400px] md:h-[500px] rounded-lg overflow-hidden flex items-end p-4 sm:p-8 mb-6 sm:mb-8 transition-all duration-500" style={{
              backgroundImage: `url(${
                typeof currentFeatured.tmdbBackdrop === 'string' && currentFeatured.tmdbBackdrop
                  ? `${TMDB_IMAGE_HD_BASE}${currentFeatured.tmdbBackdrop}`
                  : (typeof currentFeatured.backdrop === 'string' && currentFeatured.backdrop
                    ? currentFeatured.backdrop
                    : (currentFeatured.cover && typeof currentFeatured.cover === 'object' && 'url' in currentFeatured.cover
                      ? (currentFeatured.cover.url as string)
                      : '/netflix-logo.png'))
              })`,
              backgroundSize: 'cover',
              backgroundPosition: 'center'
            }}>
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent z-0" />
              <div className="z-10 max-w-2xl">
                <h1 className="text-2xl sm:text-4xl md:text-5xl font-extrabold mb-2 sm:mb-4 drop-shadow-lg">{typeof currentFeatured.title === 'string' ? currentFeatured.title : ''}</h1>
                <p className="text-sm sm:text-lg md:text-2xl mb-4 sm:mb-6 max-w-xl drop-shadow-lg line-clamp-3">{currentFeatured.description as string}</p>
                <div className="flex gap-2 sm:gap-4">
                  <button
                    className="bg-white text-black font-bold px-4 sm:px-8 py-2 sm:py-3 rounded flex items-center gap-1 sm:gap-2 text-sm sm:text-lg hover:bg-neutral-200 transition"
                    onClick={() => handleStreaming(
                      currentFeatured.detailPath as string,
                      currentFeatured.subjectId as string,
                      typeof currentFeatured.title === 'string' ? currentFeatured.title : ''
                    )}
                  >
                    <svg xmlns='http://www.w3.org/2000/svg' fill='currentColor' viewBox='0 0 24 24' className='w-4 h-4 sm:w-6 sm:h-6'><path d='M8 5v14l11-7z'/></svg>
                    Play
                  </button>
                  <button
                    className="bg-neutral-700/80 text-white font-bold px-4 sm:px-8 py-2 sm:py-3 rounded flex items-center gap-1 sm:gap-2 text-sm sm:text-lg hover:bg-neutral-600 transition"
                    onClick={() => router.push(`/detail/${currentFeatured.detailPath as string}?subjectId=${currentFeatured.subjectId as string}`)}
                  >
                    <svg xmlns='http://www.w3.org/2000/svg' fill='none' stroke='currentColor' strokeWidth='2' viewBox='0 0 24 24' className='w-4 h-4 sm:w-6 sm:h-6'><circle cx='12' cy='12' r='10'/><line x1='12' y1='16' x2='12' y2='12'/><line x1='12' y1='8' x2='12' y2='8'/></svg>
                    More Info
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}
        {/* Ranking/Category Carousels */}
        <SectionMbapiCarousel title="Trending" tagline="What's hot right now" endpoint="6997489734092554288" onStreaming={handleStreaming} />
        <SectionMbapiCarousel title="Popular Movies" tagline="Everyone's watching these" endpoint="997144265920760504" onStreaming={handleStreaming} />
        <SectionMbapiCarousel title="Pinoy Movies" tagline="The best of Filipino cinema" endpoint="3794471624892629256" onStreaming={handleStreaming} />
        <SectionMbapiCarousel title="Pinoy Tv Shows" tagline="Must-watch Filipino series" endpoint="8449223314756747760" onStreaming={handleStreaming} />
        <SectionMbapiCarousel title="Hot Netflix" tagline="Trending on Netflix" endpoint="2279719389253566536" onStreaming={handleStreaming} />
        <SectionMbapiCarousel title="Hot K-Drama" tagline="Hot Korean Dramas" endpoint="4380734070238626200" onStreaming={handleStreaming} />
        <SectionMbapiCarousel title="Hot C-Drama" tagline="Hot Chinese Dramas" endpoint="173752404280836544" onStreaming={handleStreaming} />
        <SectionMbapiCarousel title="Recently Added Tagalog Dub" tagline="Fresh Tagalog dubs just for you" endpoint="4811121376339919952" onStreaming={handleStreaming} />
        <SectionMbapiCarousel title="Top Movies" tagline="Critically acclaimed masterpieces" endpoint="movie_hottest" onStreaming={handleStreaming} />
        <SectionMbapiCarousel title="Top TV Shows" tagline="Award-winning series" endpoint="tv_hottest" onStreaming={handleStreaming} />
        <SectionMbapiCarousel title="Top Anime" tagline="Epic animated adventures" endpoint="animation_hottest" onStreaming={handleStreaming} />
        {/* Suggestions Section */}
        <SectionSuggestionsCarousel title="Suggestions For You" tagline="Personalized picks based on your taste" items={suggestions} loading={loadingSuggestions} onStreaming={handleStreaming} />
      </main>
      <VideoPlayer
        src={streamingUrl || ""}
        title={playerTitle}
        isOpen={playerOpen}
        onClose={() => setPlayerOpen(false)}
        availableStreams={availableStreams}
        streamId={playerStreamId}
        subjectId={playerSubjectId}
        season={playerSeason}
        episode={playerEpisode}
      />
    </div>
  );
}

function SectionSuggestionsCarousel({ title, tagline, items, loading, onStreaming }: { title: string; tagline: string; items: Array<Record<string, unknown>>; loading: boolean; onStreaming: (detailPath: string, subjectId: string, title: string) => Promise<void> }) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState("");
  const [modalData, setModalData] = useState<Record<string, unknown> | null>(null);
  const [modalItem, setModalItem] = useState<Record<string, unknown> | null>(null);
  const [streamingError, setStreamingError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    const { clientWidth } = scrollRef.current;
    scrollRef.current.scrollBy({
      left: direction === "left" ? -clientWidth : clientWidth,
      behavior: "smooth",
    });
  };

  const hasItems = items.length > 0;

  async function handleMoreInfo(item: Record<string, unknown>) {
    setModalOpen(true);
    setModalLoading(true);
    setModalError("");
    setModalData(null);
    setModalItem(item);
    try {
      const type = (item.subjectType as number) === 2 ? "tv" : "movie";
      const year = item.releaseDate ? (item.releaseDate as string).split("-")[0] : undefined;
      const searchUrl = `https://api.themoviedb.org/3/search/${type}`;
      const searchRes = await axios.get(searchUrl, {
        params: {
          api_key: TMDB_API_KEY,
          query: item.title,
          ...(year && (type === "movie" ? { year } : { first_air_date_year: year })),
        },
      });
      const results = searchRes.data.results;
      if (!results.length) {
        setModalData({
          title: item.title,
          overview: item.description || "No description available.",
          release_date: item.releaseDate,
          genres: item.genre ? (item.genre as string).split(",")?.map((g: string) => ({ name: g.trim() })) : [],
          vote_average: item.imdbRatingValue || "-",
          backdrop_path: undefined,
        });
        setModalLoading(false);
        return;
      }
      const tmdbId = results[0].id;
      const detailsUrl = `https://api.themoviedb.org/3/${type}/${tmdbId}`;
      const detailsRes = await axios.get(detailsUrl, {
        params: { api_key: TMDB_API_KEY },
      });
      setModalData(detailsRes.data);
    } catch {
      setModalError("Failed to fetch details from TMDB.");
    } finally {
      setModalLoading(false);
    }
  }

  function closeModal() {
    setModalOpen(false);
    setModalData(null);
    setModalError("");
    setStreamingError("");
  }

  return (
    <section className="w-full max-w-5xl mb-12 relative group">
      <h2 className="text-2xl font-semibold mb-4 border-l-4 border-red-600 pl-4">{title}</h2>
      <p className="text-base text-neutral-300 mb-8">{tagline}</p>
      {/* Slider buttons for desktop */}
      <button
        className="hidden md:flex absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-black/60 hover:bg-black/80 text-white rounded-full w-10 h-10 items-center justify-center transition group-hover:flex"
        style={{ display: hasItems ? undefined : "none" }}
        onClick={() => scroll("left")}
        aria-label="Scroll left"
      >
        <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7"/></svg>
      </button>
      <button
        className="hidden md:flex absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-black/60 hover:bg-black/80 text-white rounded-full w-10 h-10 items-center justify-center transition group-hover:flex"
        style={{ display: hasItems ? undefined : "none" }}
        onClick={() => scroll("right")}
        aria-label="Scroll right"
      >
        <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>
      </button>
      <div ref={scrollRef} className="overflow-x-auto whitespace-nowrap pb-2 scrollbar-hide scroll-smooth">
        {loading ? (
          <div className="h-48 flex items-center justify-center text-neutral-400 text-xl">Loading...</div>
        ) : !hasItems ? (
          <div className="h-48 flex items-center justify-center text-neutral-400 text-xl">No suggestions found.</div>
        ) : (
          <div className="flex gap-4">
            {items.map((item: Record<string, unknown>) => (
              <div
                key={item.subjectId as string}
                className="inline-block w-[100px] sm:w-[120px] md:w-[140px] lg:w-[160px] flex-shrink-0 relative group cursor-pointer touch-manipulation"
                onClick={() => handleMoreInfo(item)}
                tabIndex={0}
                role="button"
                aria-label={`Show details for ${item.title}`}
              >
                <div className="relative w-full" style={{ aspectRatio: '2/3' }}>
                  <img
                    src={(item.cover as { url: string }).url}
                    alt={item.title as string}
                    className="w-full h-full rounded-lg shadow-md object-cover"
                    loading="lazy"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm transition-all">
          <div className="relative max-w-3xl w-full mx-4 rounded-2xl shadow-2xl bg-white/10 border border-white/20 text-white overflow-hidden animate-modal-in" style={{backdropFilter: 'blur(24px)'}}>
            <button className="absolute top-4 right-4 text-3xl bg-white/20 hover:bg-white/40 rounded-full w-10 h-10 flex items-center justify-center transition-all shadow-lg z-20" onClick={closeModal} aria-label="Close dialog">
              <span className="sr-only">Close</span>
              &times;
            </button>
            {modalLoading ? (
              <div className="text-center py-16 text-lg font-semibold">Loading...</div>
            ) : modalError ? (
              <div className="text-center py-16 text-red-400 text-lg font-semibold">{modalError}</div>
            ) : modalData ? (
              <div>
                <div className="relative rounded-t-2xl overflow-hidden mb-4" style={{height: '300px', background: modalData.backdrop_path ? ((modalData.backdrop_path as string).startsWith('/') ? `url(https://image.tmdb.org/t/p/original${modalData.backdrop_path}) center/cover` : `url(${modalData.backdrop_path}) center/cover`) : '#222'}}>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent z-0" />
                  <div className="relative z-10 flex flex-col justify-end h-full p-6 sm:p-10">
                    <h3 className="text-4xl font-extrabold mb-4 drop-shadow-lg">{(modalData.title as string) || (modalData.name as string)}</h3>
                    <div className="flex gap-4 mb-3">
                      <button
                        className="bg-white text-black font-bold px-6 sm:px-10 py-2 sm:py-3 rounded-lg flex items-center justify-center gap-1 sm:gap-2 text-sm sm:text-xl hover:bg-neutral-200 transition shadow"
                        onClick={() => {
                          if (modalItem) {
                            onStreaming(
                              modalItem.detailPath as string,
                              modalItem.subjectId as string,
                              (modalItem.title as string) || (modalItem.name as string) || ""
                            );
                          }
                        }}
                      >
                        <svg xmlns='http://www.w3.org/2000/svg' fill='currentColor' viewBox='0 0 24 24' className='w-7 h-7'><path d='M8 5v14l11-7z'/></svg>
                        Play
                      </button>
                      {modalItem && (modalItem.subjectType as number) === 2 && (
                        <button
                          className="bg-neutral-700/80 text-white font-bold px-6 sm:px-10 py-2 sm:py-3 rounded-lg flex items-center justify-center gap-1 sm:gap-2 text-sm sm:text-xl hover:bg-neutral-600 transition shadow"
                          onClick={() => {
                            if (modalItem) {
                              router.push(`/detail/${modalItem.detailPath}?subjectId=${modalItem.subjectId}`);
                            }
                          }}
                        >
                          <svg xmlns='http://www.w3.org/2000/svg' fill='none' stroke='currentColor' strokeWidth='2' viewBox='0 0 24 24' className='w-5 h-5 sm:w-7 sm:h-7'><circle cx='12' cy='12' r='10'/><line x1='12' y1='16' x2='12' y2='12'/><line x1='12' y1='8' x2='12' y2='8'/></svg>
                          Info
                        </button>
                      )}
                    </div>
                    {streamingError && (
                      <div className="text-red-400 text-sm mb-3">{streamingError}</div>
                    )}
                  </div>
                </div>
                <div className="px-10 pb-10">
                  <p className="mb-6 text-neutral-100 text-lg leading-relaxed">{modalData.overview as string}</p>
                  <div className="mb-2 text-base text-neutral-300 flex flex-wrap gap-x-8 gap-y-2">
                    <span>Release: <span className="font-semibold text-white">{(modalData.release_date as string) || (modalData.first_air_date as string)}</span></span>
                    <span>Rating: <span className="font-semibold text-white">{modalData.vote_average as string | number}</span></span>
                    <span>Genres: <span className="font-semibold text-white">{
                      Array.isArray(modalData.genres)
                        ? modalData.genres.map((g: { name: string }) => g.name).join(", ")
                        : ""
                    }</span></span>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}

// Add a generic SectionMbapiCarousel component for ranking-list endpoints
function SectionMbapiCarousel({ title, tagline, endpoint, onStreaming }: { title: string; tagline: string; endpoint: string; onStreaming: (detailPath: string, subjectId: string, title: string) => Promise<void> }) {
  const router = useRouter();
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState("");
  const [modalData, setModalData] = useState<Record<string, unknown> | null>(null);
  const [modalItem, setModalItem] = useState<Record<string, unknown> | null>(null);
  const [streamingError, setStreamingError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function fetchItems() {
      setLoading(true);
      try {
        const res = await axios.get(`https://movapi.xyz/mbapi/ranking-list/${endpoint}`);
        setItems(res.data.data.subjectList || []);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    }
    fetchItems();
  }, [endpoint]);

  const scroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    const { clientWidth } = scrollRef.current;
    scrollRef.current.scrollBy({
      left: direction === "left" ? -clientWidth : clientWidth,
      behavior: "smooth",
    });
  };

  const hasItems = items.length > 0;

  async function handleMoreInfo(item: Record<string, unknown>) {
    setModalOpen(true);
    setModalLoading(true);
    setModalError("");
    setModalData(null);
    setModalItem(item);
    try {
      const type = (item.subjectType as number) === 2 ? "tv" : "movie";
      const year = item.releaseDate ? (item.releaseDate as string).split("-")[0] : undefined;
      const searchUrl = `https://api.themoviedb.org/3/search/${type}`;
      const searchRes = await axios.get(searchUrl, {
        params: {
          api_key: TMDB_API_KEY,
          query: item.title,
          ...(year && (type === "movie" ? { year } : { first_air_date_year: year })),
        },
      });
      const results = searchRes.data.results;
      if (!results.length) {
        setModalData({
          title: item.title,
          overview: item.description || "No description available.",
          release_date: item.releaseDate,
          genres: item.genre ? (item.genre as string).split(",")?.map((g: string) => ({ name: g.trim() })) : [],
          vote_average: item.imdbRatingValue || "-",
          backdrop_path: undefined,
        });
        setModalLoading(false);
        return;
      }
      const tmdbId = results[0].id;
      const detailsUrl = `https://api.themoviedb.org/3/${type}/${tmdbId}`;
      const detailsRes = await axios.get(detailsUrl, {
        params: { api_key: TMDB_API_KEY },
      });
      setModalData(detailsRes.data);
    } catch {
      setModalError("Failed to fetch details from TMDB.");
    } finally {
      setModalLoading(false);
    }
  }

  function closeModal() {
    setModalOpen(false);
    setModalData(null);
    setModalError("");
    setStreamingError("");
  }

  return (
    <section className="w-full max-w-5xl mb-8 sm:mb-12 relative group">
      <h2 className="text-xl sm:text-2xl font-semibold mb-2 sm:mb-4 border-l-4 border-red-600 pl-3 sm:pl-4">{title}</h2>
      <p className="text-sm sm:text-base text-neutral-300 mb-6 sm:mb-8">{tagline}</p>
      <button
        className="hidden md:flex absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-black/60 hover:bg-black/80 text-white rounded-full w-10 h-10 items-center justify-center transition group-hover:flex"
        style={{ display: hasItems ? undefined : "none" }}
        onClick={() => scroll("left")}
        aria-label="Scroll left"
      >
        <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7"/></svg>
      </button>
      <button
        className="hidden md:flex absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-black/60 hover:bg-black/80 text-white rounded-full w-10 h-10 items-center justify-center transition group-hover:flex"
        style={{ display: hasItems ? undefined : "none" }}
        onClick={() => scroll("right")}
        aria-label="Scroll right"
      >
        <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>
      </button>
      <div ref={scrollRef} className="overflow-x-auto whitespace-nowrap pb-2 scrollbar-hide scroll-smooth">
        {loading ? (
          <div className="h-32 sm:h-48 flex items-center justify-center text-neutral-400 text-lg sm:text-xl">Loading...</div>
        ) : !hasItems ? (
          <div className="h-32 sm:h-48 flex items-center justify-center text-neutral-400 text-lg sm:text-xl">No items found.</div>
        ) : (
          <div className="flex gap-2 sm:gap-4">
            {items.map((item: Record<string, unknown>) => (
              <div
                key={item.subjectId as string}
                className="inline-block w-[100px] sm:w-[120px] md:w-[140px] lg:w-[160px] flex-shrink-0 relative group cursor-pointer touch-manipulation"
                onClick={() => handleMoreInfo(item)}
                tabIndex={0}
                role="button"
                aria-label={`Show details for ${item.title}`}
              >
                <div className="relative w-full" style={{ aspectRatio: '2/3' }}>
                  <img
                    src={(item.cover as { url: string }).url}
                    alt={item.title as string}
                    className="w-full h-full rounded-lg shadow-md object-cover"
                    loading="lazy"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {/* Modal (reuse the same modal logic as suggestions) */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm transition-all p-2 sm:p-4">
          <div className="relative max-w-3xl w-full mx-2 sm:mx-4 rounded-2xl shadow-2xl bg-white/10 border border-white/20 text-white overflow-hidden animate-modal-in" style={{backdropFilter: 'blur(24px)'}}>
            <button className="absolute top-2 sm:top-4 right-2 sm:right-4 text-2xl sm:text-3xl bg-white/20 hover:bg-white/40 rounded-full w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center transition-all shadow-lg z-20" onClick={closeModal} aria-label="Close dialog">
              <span className="sr-only">Close</span>
              &times;
            </button>
            {modalLoading ? (
              <div className="text-center py-12 sm:py-16 text-base sm:text-lg font-semibold">Loading...</div>
            ) : modalError ? (
              <div className="text-center py-12 sm:py-16 text-red-400 text-base sm:text-lg font-semibold">{modalError}</div>
            ) : modalData ? (
              <div>
                <div className="relative rounded-t-2xl overflow-hidden mb-4" style={{height: '300px', background: modalData.backdrop_path ? ((modalData.backdrop_path as string).startsWith('/') ? `url(https://image.tmdb.org/t/p/original${modalData.backdrop_path}) center/cover` : `url(${modalData.backdrop_path}) center/cover`) : '#222'}}>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent z-0" />
                  <div className="relative z-10 flex flex-col justify-end h-full p-6 sm:p-10">
                    <h3 className="text-2xl sm:text-4xl font-extrabold mb-2 sm:mb-4 drop-shadow-lg">{(modalData.title as string) || (modalData.name as string)}</h3>
                    <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 mb-3">
                      {modalItem && (modalItem.subjectType as number) !== 2 && (
                        <button
                          className="bg-white text-black font-bold px-6 sm:px-10 py-2 sm:py-3 rounded-lg flex items-center justify-center gap-1 sm:gap-2 text-sm sm:text-xl hover:bg-neutral-200 transition shadow"
                          onClick={() => {
                            if (modalItem) {
                              onStreaming(
                                modalItem.detailPath as string,
                                modalItem.subjectId as string,
                                (modalItem.title as string) || (modalItem.name as string) || ""
                              );
                            }
                          }}
                        >
                          <svg xmlns='http://www.w3.org/2000/svg' fill='currentColor' viewBox='0 0 24 24' className='w-5 h-5 sm:w-7 sm:h-7'><path d='M8 5v14l11-7z'/></svg>
                          Play
                        </button>
                      )}
                      {modalItem && (modalItem.subjectType as number) === 2 && (
                        <button
                          className="bg-neutral-700/80 text-white font-bold px-6 sm:px-10 py-2 sm:py-3 rounded-lg flex items-center justify-center gap-1 sm:gap-2 text-sm sm:text-xl hover:bg-neutral-600 transition shadow"
                          onClick={() => {
                            if (modalItem) {
                              router.push(`/detail/${modalItem.detailPath}?subjectId=${modalItem.subjectId}`);
                            }
                          }}
                        >
                          <svg xmlns='http://www.w3.org/2000/svg' fill='none' stroke='currentColor' strokeWidth='2' viewBox='0 0 24 24' className='w-5 h-5 sm:w-7 sm:h-7'><circle cx='12' cy='12' r='10'/><line x1='12' y1='16' x2='12' y2='12'/><line x1='12' y1='8' x2='12' y2='8'/></svg>
                          Info
                        </button>
                      )}
                    </div>
                    {streamingError && (
                      <div className="text-red-400 text-xs sm:text-sm mb-3">{streamingError}</div>
                    )}
                  </div>
                </div>
                <div className="px-4 sm:px-10 pb-6 sm:pb-10">
                  <p className="mb-4 sm:mb-6 text-neutral-100 text-sm sm:text-lg leading-relaxed">{modalData.overview as string}</p>
                  <div className="mb-2 text-xs sm:text-base text-neutral-300 flex flex-col sm:flex-row sm:flex-wrap gap-x-8 gap-y-1 sm:gap-y-2">
                    <span>Release: <span className="font-semibold text-white">{(modalData.release_date as string) || (modalData.first_air_date as string)}</span></span>
                    <span>Rating: <span className="font-semibold text-white">{modalData.vote_average as string | number}</span></span>
                    <span>Genres: <span className="font-semibold text-white">{
                      Array.isArray(modalData.genres)
                        ? modalData.genres.map((g: { name: string }) => g.name).join(", ")
                        : ""
                    }</span></span>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}

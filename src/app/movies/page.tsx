"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { FaPlay } from "react-icons/fa";
import dynamic from "next/dynamic";

interface Movie {
  subjectId: string;
  title: string;
  cover: { url: string };
  releaseDate: string;
  genre: string;
  imdbRatingValue: string;
  detailPath: string;
}

const TopNavDrawer = dynamic(() => import("../components/TopNavDrawer"), { ssr: false });

function TopNav() {
  return (
    <nav className="w-full bg-gradient-to-r from-black via-gray-900 to-black/80 border-b border-gray-800 flex items-center justify-center py-3 px-4 z-50 sticky top-0 backdrop-blur-md shadow-lg">
      <div className="flex gap-6 text-lg font-semibold">
        <a href="/" className="hover:text-red-500 transition-colors">Home</a>
        <a href="/tv" className="hover:text-red-500 transition-colors">TV Shows</a>
        <a href="/movies" className="hover:text-red-500 transition-colors">Movies</a>
      </div>
    </nav>
  );
}

export default function MoviesPage() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("https://movapi.xyz/mbapi/category/1")
      .then(res => res.json())
      .then(data => {
        console.log("/movies API response:", data);
        if (!data?.data?.items || !Array.isArray(data.data.items) || data.data.items.length === 0) {
          setError("No movies found. Check API response in console.");
        }
        setMovies(data.data.items || []);
        setLoading(false);
      })
      .catch((err) => {
        setError("Failed to load movies.");
        setLoading(false);
        console.error("/movies fetch error:", err);
      });
  }, []);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-neutral-400 text-xl">Loading...</div>;
  if (error) return <div className="min-h-screen flex items-center justify-center text-red-500 text-xl">{error}</div>;

  if (movies.length === 0) {
    return <div className="min-h-screen flex items-center justify-center text-yellow-400 text-xl">No movies found. Check API response in console.</div>;
  }

  return (
    <div className="min-h-screen relative text-white">
      <TopNavDrawer />
      <div className="fixed inset-0 -z-10 animate-gradient bg-gradient-to-br from-black via-gray-900 to-[#1a1a2e] opacity-90" style={{backgroundSize:'200% 200%'}} />
      <TopNav />
      <h1 className="text-4xl font-extrabold mb-10 text-center tracking-tight mt-8 drop-shadow-lg">Movies</h1>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-8 px-2 sm:px-8">
        {movies.map(movie => (
          <Link
            key={movie.subjectId}
            href={`/detail/${movie.detailPath}?subjectId=${movie.subjectId}`}
            className="group relative block rounded-2xl overflow-hidden shadow-xl hover:shadow-2xl transition-all duration-300 bg-white/10 backdrop-blur-md border border-white/10 hover:border-red-600"
            style={{ minHeight: 320 }}
          >
            <img
              src={movie.cover?.url}
              alt={movie.title}
              className="w-full h-72 object-cover group-hover:scale-105 transition-transform duration-300"
            />
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
              <div className="bg-black/60 rounded-full p-4 shadow-lg">
                <FaPlay className="w-8 h-8 text-white drop-shadow-lg" />
              </div>
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end">
              <div className="p-4">
                <h2 className="text-xl font-bold mb-1 truncate text-white drop-shadow-lg">{movie.title}</h2>
                <div className="text-xs text-gray-300 mb-1">{movie.releaseDate}</div>
                <div className="text-xs text-gray-300 mb-1">{movie.genre}</div>
                <div className="text-xs text-yellow-400 font-semibold">IMDB: {movie.imdbRatingValue}</div>
              </div>
            </div>
            <div className="absolute bottom-0 left-0 right-0 bg-black/80 py-2 px-3 text-center text-base font-semibold truncate text-white group-hover:bg-red-700/80 transition-colors duration-300 backdrop-blur-md">
              {movie.title}
            </div>
          </Link>
        ))}
      </div>
      <style jsx global>{`
        @keyframes gradient {
          0% {background-position: 0% 50%;}
          50% {background-position: 100% 50%;}
          100% {background-position: 0% 50%;}
        }
        .animate-gradient {
          animation: gradient 16s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
} 
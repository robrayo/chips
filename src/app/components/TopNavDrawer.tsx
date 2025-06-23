"use client";
import { useState } from "react";
import Link from "next/link";
import { FaBars, FaTimes } from "react-icons/fa";

export default function TopNavDrawer() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Hamburger button (mobile only) */}
      <button
        className="md:hidden fixed top-4 left-4 z-50 bg-black/70 p-2 rounded-full text-white shadow-lg focus:outline-none"
        onClick={() => setOpen(true)}
        aria-label="Open navigation menu"
      >
        <FaBars className="w-6 h-6" />
      </button>

      {/* Drawer overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Drawer */}
      <nav
        className={`fixed top-0 left-0 h-full w-64 bg-gradient-to-b from-black via-gray-900 to-black z-50 shadow-2xl transform transition-transform duration-300 md:hidden ${open ? "translate-x-0" : "-translate-x-full"}`}
        style={{ willChange: "transform" }}
        aria-label="Mobile navigation drawer"
      >
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-800">
          <span className="text-xl font-bold text-white">CHIPSFLIX</span>
          <button
            className="text-white p-2 rounded-full hover:bg-gray-800 focus:outline-none"
            onClick={() => setOpen(false)}
            aria-label="Close navigation menu"
          >
            <FaTimes className="w-5 h-5" />
          </button>
        </div>
        <ul className="flex flex-col gap-2 mt-6 px-4">
          <li>
            <Link href="/" className="block py-3 px-2 rounded text-lg font-semibold text-white hover:bg-red-600 transition" onClick={() => setOpen(false)}>
              Home
            </Link>
          </li>
          <li>
            <Link href="/tv" className="block py-3 px-2 rounded text-lg font-semibold text-white hover:bg-red-600 transition" onClick={() => setOpen(false)}>
              TV Shows
            </Link>
          </li>
          <li>
            <Link href="/movies" className="block py-3 px-2 rounded text-lg font-semibold text-white hover:bg-red-600 transition" onClick={() => setOpen(false)}>
              Movies
            </Link>
          </li>
        </ul>
      </nav>
    </>
  );
} 
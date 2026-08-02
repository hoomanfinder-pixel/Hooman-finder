// src/components/SiteFooter.jsx
import React from "react";
import { Link } from "react-router-dom";

export default function SiteFooter() {
  return (
    <footer className="border-t border-[#C7D4BB]/60 bg-[#F5F1E9]">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-[#6F6A66]">
            Hooman Finder helps you discover adoptable dogs by lifestyle fit. Continue
            the adoption process directly with the listing shelter or rescue.
          </p>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
            <Link
              to="/about"
              className="text-[#183D35]/75 underline-offset-4 hover:text-[#183D35] hover:underline"
            >
              About
            </Link>
            <Link
              to="/shelters/join"
              className="text-[#183D35]/75 underline-offset-4 hover:text-[#183D35] hover:underline"
            >
              For shelters &amp; rescues
            </Link>
            <Link
              to="/contact"
              className="text-[#183D35]/75 underline-offset-4 hover:text-[#183D35] hover:underline"
            >
              Contact
            </Link>
            <Link
              to="/privacy"
              className="text-[#183D35]/75 underline-offset-4 hover:text-[#183D35] hover:underline"
            >
              Privacy
            </Link>
            <Link
              to="/terms"
              className="text-[#183D35]/75 underline-offset-4 hover:text-[#183D35] hover:underline"
            >
              Terms
            </Link>
            <a
              href="https://www.instagram.com/hoomanfinder/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Follow Hooman Finder on Instagram (opens in a new tab)"
              className="inline-flex items-center gap-1.5 text-[#183D35]/75 underline-offset-4 hover:text-[#183D35] hover:underline"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden="true"
                className="h-4 w-4 shrink-0"
              >
                <rect x="3" y="3" width="18" height="18" rx="5" />
                <circle cx="12" cy="12" r="4" />
                <circle cx="17.4" cy="6.6" r="1" fill="currentColor" stroke="none" />
              </svg>
              Instagram
            </a>
            <a
              href="https://www.tiktok.com/@hoomanfinder"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Follow Hooman Finder on TikTok (opens in a new tab)"
              className="inline-flex items-center gap-1.5 text-[#183D35]/75 underline-offset-4 hover:text-[#183D35] hover:underline"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="h-4 w-4 shrink-0"
              >
                <path d="M14 4v10.5a4.5 4.5 0 1 1-3.5-4.39" />
                <path d="M14 4c.7 2.1 2.3 3.7 4.5 4.3" />
              </svg>
              TikTok
            </a>
          </div>
        </div>

        <div className="mt-3 text-[11px] text-[#6F6A66]">
          © {new Date().getFullYear()} Hooman Finder
        </div>
      </div>
    </footer>
  );
}

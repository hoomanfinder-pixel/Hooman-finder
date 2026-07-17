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
              className="text-[#0F2742]/75 underline-offset-4 hover:text-[#0F2742] hover:underline"
            >
              About
            </Link>
            <Link
              to="/shelters/join"
              className="text-[#0F2742]/75 underline-offset-4 hover:text-[#0F2742] hover:underline"
            >
              For shelters &amp; rescues
            </Link>
            <Link
              to="/contact"
              className="text-[#0F2742]/75 underline-offset-4 hover:text-[#0F2742] hover:underline"
            >
              Contact
            </Link>
            <Link
              to="/privacy"
              className="text-[#0F2742]/75 underline-offset-4 hover:text-[#0F2742] hover:underline"
            >
              Privacy
            </Link>
            <Link
              to="/terms"
              className="text-[#0F2742]/75 underline-offset-4 hover:text-[#0F2742] hover:underline"
            >
              Terms
            </Link>
          </div>
        </div>

        <div className="mt-3 text-[11px] text-[#6F6A66]">
          © {new Date().getFullYear()} Hooman Finder
        </div>
      </div>
    </footer>
  );
}

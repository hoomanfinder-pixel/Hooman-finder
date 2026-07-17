// src/pages/Contact.jsx
import React from "react";
import { Link, useNavigate } from "react-router-dom";
import SEO from "../components/SEO";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";

export default function Contact() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#F5F1E9] font-['Inter',sans-serif] text-[#0F2742] flex flex-col">
      <SEO
        title="Contact Hooman Finder"
        description="Contact Hooman Finder with questions, comments, or suggestions about dog adoption matching."
        canonicalPath="/contact"
        ogImage="/home-hero-dogs.jpg"
        ogImageAlt="Rescue dogs looking for their future home"
      />
      <SiteHeader ctas={[{ label: "Take the quiz", to: "/quiz", variant: "primary" }]} />

      <main className="mx-auto max-w-3xl w-full px-4 py-10 flex-1">
        <h1 className="font-['Fraunces',serif] text-3xl font-semibold tracking-tight text-[#0F2742]">
          Contact
        </h1>
        <p className="mt-2 text-[#6F6A66]">
          Questions, comments, or suggestions? Email us anytime:
        </p>

        <div className="mt-6 rounded-2xl border border-[#C7D4BB] bg-white p-6 shadow-sm">
          <div className="text-sm font-semibold text-[#0F2742]">Email</div>

          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <a
              href="mailto:info@hoomanfinder.com"
              className="text-lg font-bold text-[#0F2742] underline-offset-4 hover:underline"
            >
              info@hoomanfinder.com
            </a>

            <button
              onClick={() => navigator.clipboard?.writeText("info@hoomanfinder.com")}
              className="inline-flex items-center justify-center rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#0F2742] border border-[#C7D4BB] hover:bg-[#EFE8DC]"
            >
              Copy email
            </button>
          </div>

          <p className="mt-4 text-sm text-[#6F6A66]">
            If you're a shelter or rescue, you can also use the "For shelters" link in the footer.
          </p>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center justify-center rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-[#0F2742] border border-[#C7D4BB] hover:bg-[#EFE8DC]"
          >
            Back
          </button>

          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-full bg-[#0F2742] px-5 py-2.5 text-sm font-semibold text-[#F3C982] hover:bg-[#0C1E35]"
          >
            Back to home
          </Link>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

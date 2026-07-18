// src/pages/About.jsx
import React from "react";
import { useNavigate } from "react-router-dom";
import SEO from "../components/SEO";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";

export default function About() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#F5F1E9] font-['Inter',sans-serif] text-[#183D35] flex flex-col">
      <SEO
        title="About Hooman Finder | Dog Adoption Matching"
        description="Learn how Hooman Finder helps adopters discover rescue dogs that may fit their lifestyle, home, and adoption preferences."
        canonicalPath="/about"
        ogImage="/hero-dog.jpg"
        ogImageAlt="Adoptable rescue dog"
      />
      <SiteHeader
        ctas={[
          { label: "Browse dogs", to: "/dogs", variant: "secondary" },
          { label: "Take the quiz", to: "/quiz", variant: "primary" },
        ]}
      />

      <main className="mx-auto max-w-6xl w-full px-4 py-10 flex-1">
        {/* Hero card */}
        <section className="relative overflow-hidden rounded-3xl border border-[#C7D4BB] bg-white shadow-sm">
          <div className="absolute inset-0">
            <img
              src="/hero-dog.jpg"
              alt=""
              className="h-full w-full object-cover opacity-25"
            />
            <div className="absolute inset-0 bg-white/35" />
          </div>

          <div className="relative px-6 py-12 md:px-12 md:py-14">
            <div className="max-w-3xl">
              <h1 className="font-['Fraunces',serif] text-4xl md:text-5xl font-semibold tracking-tight text-[#183D35]">
                About Hooman Finder
              </h1>

              <p className="mt-4 text-[#6F6A66] leading-relaxed">
                Hooman Finder helps people discover rescue dogs whose available profiles
                align with their lifestyle, home, and routine.
              </p>

              <div className="mt-7 flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => navigate("/quiz")}
                  className="inline-flex items-center justify-center rounded-full bg-[#183D35] px-7 py-3 text-sm font-semibold text-[#F3C982] hover:bg-[#12332C]"
                >
                  Start matching
                </button>

                <button
                  onClick={() => navigate("/dogs")}
                  className="inline-flex items-center justify-center rounded-full bg-white px-7 py-3 text-sm font-semibold text-[#183D35] border border-[#C7D4BB] hover:bg-[#EFE8DC]"
                >
                  Browse adoptable dogs
                </button>

                <button
                  onClick={() => navigate("/contact")}
                  className="inline-flex items-center justify-center rounded-full bg-white px-7 py-3 text-sm font-semibold text-[#183D35] border border-[#C7D4BB] hover:bg-[#EFE8DC]"
                >
                  Contact
                </button>
              </div>

              <p className="mt-4 text-xs text-[#6F6A66]">
                Note: Hooman Finder does not process adoptions. Applications and
                final decisions happen directly through the shelter/rescue.
              </p>
            </div>
          </div>
        </section>

        {/* Content blocks */}
        <section className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-[#C7D4BB] bg-white p-6 shadow-sm">
            <h2 className="font-['Fraunces',serif] text-lg font-semibold text-[#183D35]">Why this matters</h2>
            <p className="mt-3 text-[#6F6A66] leading-relaxed">
              Adoption works best when the fit is realistic. Mismatches and returns
              are hard on adopters, shelters, and dogs, so Hooman Finder starts with
              lifestyle fit before the application step.
            </p>
          </div>

          <div className="rounded-2xl border border-[#C7D4BB] bg-white p-6 shadow-sm">
            <h2 className="font-['Fraunces',serif] text-lg font-semibold text-[#183D35]">Our mission</h2>
            <p className="mt-3 text-[#6F6A66] leading-relaxed">
              Help more people find adoptable dogs with confidence by making rescue
              dog matching simpler, clearer, and more personal.
            </p>
          </div>

          <div className="rounded-2xl border border-[#C7D4BB] bg-white p-6 shadow-sm">
            <h2 className="font-['Fraunces',serif] text-lg font-semibold text-[#183D35]">Why I started it</h2>
            <p className="mt-3 text-[#6F6A66] leading-relaxed">
              I've always wanted to rescue. I also wanted a faster, more specific
              way to find the "right" dog who's already out there waiting. Hooman
              Finder is my attempt to make dog adoption feel more thoughtful, so
              more rescue dogs land in better-fit homes.
            </p>

            <div className="mt-4 rounded-xl bg-[#EFE8DC] border border-[#C7D4BB] p-3 text-sm text-[#6F6A66]">
              <span className="font-semibold text-[#183D35]">Founder:</span>{" "}
              Lauren Breukink
            </div>
          </div>
        </section>

        {/* Bottom CTA strip */}
        <section className="mt-8 rounded-3xl border border-[#C7D4BB] bg-white p-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h3 className="font-['Fraunces',serif] text-lg font-semibold text-[#183D35]">
              Ready to meet your match?
            </h3>
            <p className="mt-1 text-sm text-[#6F6A66]">
              Take the dog adoption quiz and get a ranked list. Then apply directly through the shelter.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => navigate("/quiz")}
              className="inline-flex items-center justify-center rounded-full bg-[#183D35] px-6 py-2.5 text-sm font-semibold text-[#F3C982] hover:bg-[#12332C]"
            >
              Take the quiz
            </button>

            <button
              onClick={() => navigate("/")}
              className="inline-flex items-center justify-center rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-[#183D35] border border-[#C7D4BB] hover:bg-[#EFE8DC]"
            >
              Back to home
            </button>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

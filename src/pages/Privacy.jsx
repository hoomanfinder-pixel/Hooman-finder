import React from "react";
import SEO from "../components/SEO";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";

export default function Privacy() {
  return (
    <div className="min-h-screen bg-[#F5F1E9] font-['Inter',sans-serif] text-[#183D35] flex flex-col">
      <SEO
        title="Privacy Policy | Hooman Finder"
        description="Read how Hooman Finder handles quiz answers, saved dogs, and contact information."
        canonicalPath="/privacy"
        ogImage="/home-hero-dogs.jpg"
        ogImageAlt="Rescue dogs looking for their future home"
      />
      <SiteHeader ctas={[{ label: "Browse dogs", to: "/dogs", variant: "secondary" }]} />

      <main className="mx-auto max-w-3xl w-full px-4 py-10 flex-1">
        <h1 className="font-['Fraunces',serif] text-3xl font-semibold tracking-tight text-[#183D35]">
          Privacy Policy
        </h1>
        <p className="mt-2 text-sm text-[#6F6A66]">Last updated: June 6, 2026</p>

        <div className="mt-6 space-y-6 rounded-2xl border border-[#C7D4BB] bg-white p-6 text-[#6F6A66] shadow-sm">
          <section>
            <h2 className="font-['Fraunces',serif] text-lg font-semibold text-[#183D35]">What Hooman Finder Does</h2>
            <p className="mt-2">
              Hooman Finder helps users browse adoptable dogs and use a quiz to suggest
              potential lifestyle matches. Adoption availability and dog details come from
              rescues, shelters, or their public listings and may change.
            </p>
          </section>

          <section>
            <h2 className="font-['Fraunces',serif] text-lg font-semibold text-[#183D35]">Information We Use</h2>
            <p className="mt-2">
              Quiz answers may be used to suggest potential matches. Saved dogs may be stored
              locally in your browser so you can revisit them. If you email us, we receive the
              information you choose to send.
            </p>
          </section>

          <section>
            <h2 className="font-['Fraunces',serif] text-lg font-semibold text-[#183D35]">Adoption Details</h2>
            <p className="mt-2">
              Hooman Finder does not process adoptions, make rescue decisions, or guarantee
              availability. Please confirm adoption details directly with the rescue or shelter.
            </p>
          </section>

          <section>
            <h2 className="font-['Fraunces',serif] text-lg font-semibold text-[#183D35]">Contact</h2>
            <p className="mt-2">
              Questions about this policy can be sent to{" "}
              <a className="font-semibold underline" href="mailto:info@hoomanfinder.com">
                info@hoomanfinder.com
              </a>
              .
            </p>
          </section>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

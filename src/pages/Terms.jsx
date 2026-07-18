import React from "react";
import SEO from "../components/SEO";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";

export default function Terms() {
  return (
    <div className="min-h-screen bg-[#F5F1E9] font-['Inter',sans-serif] text-[#183D35] flex flex-col">
      <SEO
        title="Terms and Disclaimer | Hooman Finder"
        description="Read Hooman Finder terms and adoption information disclaimers for dog adoption discovery and matching."
        canonicalPath="/terms"
        ogImage="/home-hero-dogs.jpg"
        ogImageAlt="Rescue dogs looking for their future home"
      />
      <SiteHeader ctas={[{ label: "Take the quiz", to: "/quiz", variant: "primary" }]} />

      <main className="mx-auto max-w-3xl w-full px-4 py-10 flex-1">
        <h1 className="font-['Fraunces',serif] text-3xl font-semibold tracking-tight text-[#183D35]">
          Terms and Disclaimer
        </h1>
        <p className="mt-2 text-sm text-[#6F6A66]">Last updated: June 6, 2026</p>

        <div className="mt-6 space-y-6 rounded-2xl border border-[#C7D4BB] bg-white p-6 text-[#6F6A66] shadow-sm">
          <section>
            <h2 className="font-['Fraunces',serif] text-lg font-semibold text-[#183D35]">Use of the Site</h2>
            <p className="mt-2">
              Hooman Finder is a dog adoption discovery and matching website. The quiz is
              intended to suggest potential matches based on your answers and available dog
              listing information.
            </p>
          </section>

          <section>
            <h2 className="font-['Fraunces',serif] text-lg font-semibold text-[#183D35]">Adoption Information</h2>
            <p className="mt-2">
              Adoption availability, fees, requirements, and dog details are provided by
              rescues, shelters, or their public listings and may change. Users should confirm
              all details directly with the rescue or shelter before applying or visiting.
            </p>
          </section>

          <section>
            <h2 className="font-['Fraunces',serif] text-lg font-semibold text-[#183D35]">No Official Authority</h2>
            <p className="mt-2">
              Hooman Finder does not provide medical, legal, veterinary, behavioral, or official
              rescue authority. We do not approve applications, place dogs, or make final
              adoption decisions.
            </p>
          </section>

          <section>
            <h2 className="font-['Fraunces',serif] text-lg font-semibold text-[#183D35]">Contact</h2>
            <p className="mt-2">
              Questions can be sent to{" "}
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

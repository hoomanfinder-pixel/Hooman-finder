// src/pages/JoinShelters.jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";

const CONTACT_EMAIL = "info@hoomanfinder.com";

function Card({ title, id, children }) {
  return (
    <section
      id={id}
      className="rounded-2xl border border-[#C7D4BB] bg-white p-6 shadow-sm"
    >
      {title ? (
        <h2 className="font-['Fraunces',serif] text-base font-semibold text-[#183D35]">{title}</h2>
      ) : null}
      <div className={title ? "mt-4" : ""}>{children}</div>
    </section>
  );
}

function BulletList({ items }) {
  return (
    <ul className="space-y-2 text-sm text-[#6F6A66]">
      {items.map((t) => (
        <li key={t} className="flex gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#C7D4BB]" />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

function StepPill({ n, title, desc }) {
  return (
    <div className="rounded-2xl border border-[#C7D4BB] bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#183D35] text-xs font-bold text-[#F3C982]">
          {n}
        </span>
        <div>
          <p className="text-sm font-semibold text-[#183D35]">{title}</p>
          <p className="mt-1 text-sm text-[#6F6A66]">{desc}</p>
        </div>
      </div>
    </div>
  );
}

export default function JoinShelters() {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  function scrollToWhyJoin() {
    const el = document.getElementById("why-join");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(CONTACT_EMAIL);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // no-op
    }
  }

  return (
    <div className="min-h-screen bg-[#F5F1E9] font-['Inter',sans-serif] text-[#183D35] flex flex-col">
      <SiteHeader />

      <div className="mx-auto max-w-5xl w-full px-6 py-10 flex-1">
        {/* Hero */}
        <div>
          <h1 className="font-['Fraunces',serif] text-3xl md:text-4xl font-semibold text-[#183D35]">
            For Shelters &amp; Rescues
          </h1>
          <p className="mt-3 max-w-2xl text-[#6F6A66]">
            Hooman Finder helps adopters discover listed dogs through a short lifestyle
            quiz and ranked results. Applications and final decisions stay with you.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              onClick={() => navigate("/dogs")}
              className="rounded-full bg-[#183D35] px-5 py-2.5 text-sm font-semibold text-[#F3C982] hover:bg-[#12332C]"
            >
              Browse adoptable dogs →
            </button>
            <button
              onClick={() => navigate("/")}
              className="rounded-full border border-[#C7D4BB] bg-white px-5 py-2.5 text-sm font-semibold text-[#183D35] hover:bg-[#EFE8DC]"
            >
              Back to home
            </button>
            <button
              onClick={scrollToWhyJoin}
              className="text-sm font-semibold text-[#183D35] underline-offset-4 hover:underline"
            >
              Why join ↓
            </button>
          </div>
        </div>

        {/* Steps at top */}
        <div className="mt-10">
          <h2 className="text-sm font-semibold text-[#6F6A66]">
            Quick steps (2 minutes)
          </h2>

          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
            <StepPill
              n="1"
              title="Email us"
              desc="Send your shelter name, location, and apply link."
            />
            <StepPill
              n="2"
              title="Share dog profiles"
              desc="Photos + traits. More info → better matches."
            />
            <StepPill
              n="3"
              title="We publish your page"
              desc="We connect dogs to your apply link and go live."
            />
          </div>
        </div>

        {/* Main content */}
        <div className="mt-10 grid grid-cols-1 gap-6">
          <Card title="How Hooman Finder works">
            <BulletList
              items={[
                "Adopters take a short lifestyle quiz.",
                "Dogs are ranked using quiz answers and available profile details.",
                "Dog profiles link directly to your existing application process.",
                "You keep full control over approvals and communication.",
              ]}
            />
          </Card>

          <Card title="What we need from you">
            <p className="text-sm text-[#6F6A66]">
              The more complete the dog profile is, the more useful the matching
              and filtering will be for adopters. More info in → more useful results out.
            </p>

            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-[#C7D4BB] bg-[#EFE8DC] p-4">
                <p className="text-sm font-semibold text-[#183D35]">
                  Shelter / Rescue info
                </p>
                <div className="mt-3">
                  <BulletList
                    items={[
                      "Name",
                      "City + state",
                      "Application link (or website link)",
                      "Logo (optional)",
                      "Contact email (optional)",
                    ]}
                  />
                </div>
              </div>

              <div className="rounded-xl border border-[#C7D4BB] bg-[#EFE8DC] p-4">
                <p className="text-sm font-semibold text-[#183D35]">Dog profile fields</p>
                <div className="mt-3">
                  <BulletList
                    items={[
                      "Required: name, photo, adoptable status",
                      "Highly recommended: age (years), size, energy level",
                      "Traits: potty trained, good with kids, good with cats, first-time friendly",
                      "Allergy-related: hypoallergenic, shedding level, grooming level",
                      "Play style tags (multi-select): cuddly / playful / independent, etc.",
                      "Optional notes: description, placement type, placement city/state, placement notes",
                    ]}
                  />
                </div>
              </div>
            </div>

            <p className="mt-4 text-xs text-[#6F6A66]">
              Tip: adding energy level, potty trained, and kids/cats compatibility alone can make matches much more accurate.
            </p>
          </Card>

          <Card title="Contact">
            <div className="flex flex-wrap items-center gap-3">
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-sm font-semibold text-[#183D35] underline decoration-[#C7D4BB] hover:decoration-[#183D35]"
              >
                {CONTACT_EMAIL}
              </a>

              <button
                onClick={copyEmail}
                className="rounded-full border border-[#C7D4BB] bg-[#EFE8DC] px-3 py-1.5 text-xs font-semibold text-[#183D35] hover:bg-[#DFE7D7]"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                onClick={() => navigate("/dogs")}
                className="rounded-full bg-[#183D35] px-5 py-2.5 text-sm font-semibold text-[#F3C982] hover:bg-[#12332C]"
              >
                Browse adoptable dogs →
              </button>
              <button
                onClick={() => navigate("/")}
                className="rounded-full border border-[#C7D4BB] bg-white px-5 py-2.5 text-sm font-semibold text-[#183D35] hover:bg-[#EFE8DC]"
              >
                Back to home
              </button>
            </div>

            <p className="mt-3 text-xs text-[#6F6A66]">
              We're onboarding shelters manually right now to keep listings consistent and accurate.
            </p>
          </Card>

          {/* Why join moved to the very bottom */}
          <Card title="Why join" id="why-join">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <p className="text-sm text-[#6F6A66]">
                  Hooman Finder helps your dogs reach adopters searching by lifestyle,
                  while setting clearer expectations before they apply.
                </p>

                <div className="mt-4">
                  <p className="text-sm font-semibold text-[#183D35]">
                    Best fit for shelters/rescues who…
                  </p>
                  <div className="mt-3">
                    <BulletList
                      items={[
                        "Already have an application process and want traffic that converts.",
                        "Want dogs matched by lifestyle, not only filters.",
                        "Prefer a lightweight onboarding (no new software to learn).",
                        "Have limited staff time and want clearer expectations before people apply.",
                      ]}
                    />
                  </div>
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-[#183D35]">
                  Target adopter audience
                </p>
                <p className="mt-2 text-sm text-[#6F6A66]">
                  We focus on adopters who want to adopt but need confidence and
                  clarity about fit.
                </p>

                <div className="mt-3">
                  <BulletList
                    items={[
                      "First-time dog owners who need guidance.",
                      "Busy adults who want the right energy level + routine fit.",
                      "Homes with kids and/or cats who need compatibility filters.",
                      "Allergy-sensitive adopters who need shedding/hypo info.",
                    ]}
                  />
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-[#C7D4BB] bg-[#EFE8DC] p-4">
              <p className="text-sm font-semibold text-[#183D35]">
                Important: applications stay with you
              </p>
              <p className="mt-1 text-sm text-[#6F6A66]">
                Every dog profile links directly to your application or website.
                Hooman Finder does not process applications.
              </p>
            </div>
          </Card>
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}

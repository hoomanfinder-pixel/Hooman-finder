// src/pages/JoinShelters.jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";

const CONTACT_EMAIL = "hoomanfinder@gmail.com";

function Card({ title, id, children }) {
  return (
    <section
      id={id}
      className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      {title ? (
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      ) : null}
      <div className={title ? "mt-4" : ""}>{children}</div>
    </section>
  );
}

function BulletList({ items }) {
  return (
    <ul className="space-y-2 text-sm text-slate-700">
      {items.map((t) => (
        <li key={t} className="flex gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

function StepPill({ n, title, desc }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
          {n}
        </span>
        <div>
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <p className="mt-1 text-sm text-slate-600">{desc}</p>
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
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-6 py-10">
        {/* Header */}
        <div className="grid grid-cols-3 items-center">
          <div>
            <button
              onClick={() => navigate(-1)}
              className="text-sm text-slate-600 hover:text-slate-900"
            >
              ← Back
            </button>
          </div>

          <div className="flex justify-center">
            <button onClick={() => navigate("/")} aria-label="Go to home">
              <img
                src="/logo.png"
                alt="Hooman Finder"
                className="h-14 md:h-16 w-auto opacity-90 hover:opacity-100 transition"
              />
            </button>
          </div>

          {/* Top-right: Why join (scroll) */}
          <div className="flex justify-end">
            <button
              onClick={scrollToWhyJoin}
              className="text-sm font-semibold text-slate-700 hover:text-slate-900"
            >
              Why join
            </button>
          </div>
        </div>

        {/* Hero */}
        <div className="mt-10">
          <h1 className="text-3xl md:text-4xl font-semibold text-slate-900">
            For Shelters & Rescues
          </h1>
          <p className="mt-3 max-w-2xl text-slate-600">
            Hooman Finder helps match adopters with compatible rescue dogs using a
            short lifestyle quiz and ranked results — without changing how you
            handle applications.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={() => navigate("/results")}
              className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              View example dogs →
            </button>
            <button
              onClick={() => navigate("/")}
              className="rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-50"
            >
              Back to home
            </button>
          </div>
        </div>

        {/* Steps at top */}
        <div className="mt-10">
          <h2 className="text-sm font-semibold text-slate-700">
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
                "Dogs are ranked based on compatibility — not just filters.",
                "Dog profiles link directly to your existing application process.",
                "You keep full control over approvals and communication.",
              ]}
            />
          </Card>

          <Card title="What we need from you">
            <p className="text-sm text-slate-700">
              The more complete the dog profile is, the more useful the matching
              and filtering will be for adopters. More info in → more useful results out.
            </p>

            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">
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

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">Dog profile fields</p>
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

            <p className="mt-4 text-xs text-slate-500">
              Tip: adding energy level, potty trained, and kids/cats compatibility alone can make matches much more accurate.
            </p>
          </Card>

          <Card title="Contact">
            <div className="flex flex-wrap items-center gap-3">
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-sm font-semibold text-slate-900 underline decoration-slate-300 hover:decoration-slate-900"
              >
                {CONTACT_EMAIL}
              </a>

              <button
                onClick={copyEmail}
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                onClick={() => navigate("/results")}
                className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
              >
                View example dogs →
              </button>
              <button
                onClick={() => navigate("/")}
                className="rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-50"
              >
                Back to home
              </button>
            </div>

            <p className="mt-3 text-xs text-slate-500">
              We’re onboarding shelters manually right now to keep listings consistent and accurate.
            </p>
          </Card>

          {/* ✅ Why join moved to the very bottom */}
          <Card title="Why join" id="why-join">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <p className="text-sm text-slate-700">
                  Hooman Finder is designed to help your dogs reach people who are
                  likely to be a good fit — and reduce “bad-fit” inquiries by
                  showing compatibility up front.
                </p>

                <div className="mt-4">
                  <p className="text-sm font-semibold text-slate-900">
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
                <p className="text-sm font-semibold text-slate-900">
                  Target adopter audience
                </p>
                <p className="mt-2 text-sm text-slate-700">
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

            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">
                Important: applications stay with you
              </p>
              <p className="mt-1 text-sm text-slate-700">
                Every dog profile links directly to your application or website.
                Hooman Finder does not process applications.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

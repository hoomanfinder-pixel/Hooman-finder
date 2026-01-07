// src/pages/DogDetail.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";

function formatAge(ageYears) {
  const n = Number(ageYears);
  if (!Number.isFinite(n)) return "";
  if (n < 1) {
    const months = Math.max(1, Math.round(n * 12));
    return `${months} mo${months === 1 ? "" : "s"}`;
  }
  const years = Math.round(n * 10) / 10;
  return `${years} yr${years === 1 ? "" : "s"}`;
}

function prettyOrDash(value) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string" && value.trim() === "") return "—";
  return value;
}

export default function DogDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [dog, setDog] = useState(null);
  const [shelter, setShelter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState("");

  const title = useMemo(() => (dog?.name ? dog.name : "Dog profile"), [dog]);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setLoading(true);
      setErrMsg("");
      setDog(null);
      setShelter(null);

      try {
        // 1) Fetch dog
        const { data: dogData, error: dogErr } = await supabase
          .from("dogs")
          .select("*")
          .eq("id", id)
          .single();

        if (dogErr) throw dogErr;
        if (!dogData) throw new Error("Dog not found.");

        if (!isMounted) return;
        setDog(dogData);

        // 2) Fetch shelter (if exists)
        if (dogData.shelter_id) {
          const { data: shelterData, error: shelterErr } = await supabase
            .from("shelters")
            .select("id, name, city, state, website, logo_url, apply_url")
            .eq("id", dogData.shelter_id)
            .single();

          if (shelterErr) {
            // don't hard-fail the page if shelter fetch fails
            console.error("Shelter fetch error:", shelterErr);
          } else if (isMounted) {
            setShelter(shelterData || null);
          }
        }
      } catch (e) {
        console.error(e);
        if (isMounted) setErrMsg(e?.message || "Something went wrong loading this dog.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    if (id) load();

    return () => {
      isMounted = false;
    };
  }, [id]);

  const applyLink = useMemo(() => {
    // Prefer shelter.apply_url, fall back to dog.apply_url if you ever add it later
    const s = shelter?.apply_url?.trim();
    if (s) return s;
    return "";
  }, [shelter]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-10">
        <button
          onClick={() => navigate(-1)}
          className="text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          ← Back
        </button>

        <div className="mt-6 rounded-2xl border bg-white p-6">
          <div className="h-6 w-40 rounded bg-slate-100" />
          <div className="mt-4 h-64 w-full rounded-2xl bg-slate-100" />
          <div className="mt-6 space-y-3">
            <div className="h-4 w-3/4 rounded bg-slate-100" />
            <div className="h-4 w-2/3 rounded bg-slate-100" />
            <div className="h-4 w-1/2 rounded bg-slate-100" />
          </div>
        </div>
      </div>
    );
  }

  if (errMsg) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <button
          onClick={() => navigate(-1)}
          className="text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          ← Back
        </button>

        <div className="mt-6 rounded-2xl border bg-white p-6">
          <h1 className="text-xl font-semibold text-slate-900">Couldn’t load dog</h1>
          <p className="mt-2 text-slate-600">{errMsg}</p>
          <button
            onClick={() => navigate("/")}
            className="mt-5 inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Go home
          </button>
        </div>
      </div>
    );
  }

  if (!dog) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <button
          onClick={() => navigate(-1)}
          className="text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          ← Back
        </button>
        <div className="mt-6 rounded-2xl border bg-white p-6">
          <h1 className="text-xl font-semibold text-slate-900">Dog not found</h1>
          <p className="mt-2 text-slate-600">This profile may have been removed.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <button
        onClick={() => navigate(-1)}
        className="text-sm font-medium text-slate-600 hover:text-slate-900"
      >
        ← Back
      </button>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: photo */}
        <div className="lg:col-span-7">
          <div className="rounded-2xl border bg-white overflow-hidden">
            <div className="w-full bg-slate-100">
              <img
                src={dog.photo_url || ""}
                alt={dog.name || "Dog"}
                className="w-full h-[360px] sm:h-[440px] object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
              {!dog.photo_url ? (
                <div className="h-[360px] sm:h-[440px] flex items-center justify-center text-slate-500">
                  No photo available
                </div>
              ) : null}
            </div>

            <div className="p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h1 className="text-3xl font-bold text-slate-900">{title}</h1>
                  <p className="mt-2 text-slate-600">
                    Age: <span className="font-medium text-slate-900">{prettyOrDash(formatAge(dog.age_years))}</span>{" "}
                    · Size: <span className="font-medium text-slate-900">{prettyOrDash(dog.size)}</span>{" "}
                    · Energy: <span className="font-medium text-slate-900">{prettyOrDash(dog.energy_level)}</span>
                  </p>
                </div>

                {dog.adoptable === false ? (
                  <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    Not currently adoptable
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                    Adoptable
                  </span>
                )}
              </div>

              {dog.description ? (
                <p className="mt-5 text-slate-700 leading-relaxed">{dog.description}</p>
              ) : (
                <p className="mt-5 text-slate-500">No description provided.</p>
              )}

              {/* Traits */}
              <div className="mt-6 flex flex-wrap gap-2">
                {dog.potty_trained ? (
                  <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">
                    Potty trained
                  </span>
                ) : null}
                {dog.good_with_kids ? (
                  <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-800">
                    Good w/ kids
                  </span>
                ) : null}
                {dog.good_with_cats ? (
                  <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-800">
                    Good w/ cats
                  </span>
                ) : null}
                {dog.first_time_friendly ? (
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                    First-time friendly
                  </span>
                ) : null}
                {dog.hypoallergenic ? (
                  <span className="rounded-full bg-teal-100 px-3 py-1 text-xs font-semibold text-teal-800">
                    Hypoallergenic
                  </span>
                ) : null}
                {dog.shedding_level ? (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-800">
                    Shedding: {dog.shedding_level}
                  </span>
                ) : null}
                {dog.grooming_level ? (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-800">
                    Grooming: {dog.grooming_level}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Shelter block (the credibility piece) */}
        <div className="lg:col-span-5">
          <div className="rounded-2xl border bg-white p-6">
            <h2 className="text-lg font-bold text-slate-900">Shelter</h2>

            {shelter ? (
              <div className="mt-4">
                <div className="flex items-center gap-4">
                  {shelter.logo_url ? (
                    <img
                      src={shelter.logo_url}
                      alt={`${shelter.name || "Shelter"} logo`}
                      className="h-12 w-12 rounded-xl object-cover border"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-xl bg-slate-100 border flex items-center justify-center text-slate-500 text-xs font-semibold">
                      Logo
                    </div>
                  )}

                  <div>
                    <p className="text-sm text-slate-500">Listed by</p>
                    <p className="text-base font-bold text-slate-900">
                      {prettyOrDash(shelter.name)}
                    </p>
                    <p className="text-sm text-slate-600">
                      {prettyOrDash(shelter.city)}, {prettyOrDash(shelter.state)}
                    </p>
                  </div>
                </div>

                {/* Apply button */}
                <div className="mt-5">
                  {applyLink ? (
                    <a
                      href={applyLink}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
                    >
                      Apply to adopt
                    </a>
                  ) : (
                    <div className="rounded-xl border bg-slate-50 p-4">
                      <p className="text-sm font-semibold text-slate-900">Apply link missing</p>
                      <p className="mt-1 text-sm text-slate-600">
                        This shelter hasn’t provided an application link yet.
                      </p>
                    </div>
                  )}

                  <p className="mt-3 text-xs text-slate-500 leading-relaxed">
                    Hooman Finder does not process applications. Clicking “Apply to adopt” takes you directly to the
                    shelter’s adoption page.
                  </p>
                </div>

                {/* Optional website link */}
                {shelter.website ? (
                  <div className="mt-4">
                    <a
                      href={shelter.website}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-semibold text-slate-700 hover:text-slate-900 underline underline-offset-4"
                    >
                      Visit shelter website →
                    </a>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mt-4 rounded-xl border bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">Shelter info unavailable</p>
                <p className="mt-1 text-sm text-slate-600">
                  This dog is missing a shelter association or the shelter record couldn’t be loaded.
                </p>
              </div>
            )}
          </div>

          {/* Small extra credibility block */}
          <div className="mt-6 rounded-2xl border bg-white p-6">
            <h3 className="text-sm font-bold text-slate-900">What happens next?</h3>
            <ol className="mt-3 space-y-2 text-sm text-slate-700">
              <li>1) Review this dog’s details</li>
              <li>2) Click <span className="font-semibold">Apply to adopt</span></li>
              <li>3) You’ll apply directly through the shelter</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}

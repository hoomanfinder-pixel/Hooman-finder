// src/pages/Shelter.jsx
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";
import DogCard from "../components/DogCard";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import { filterPublicDogs } from "../lib/dogVisibility";
import { normalizeExternalUrl } from "../lib/urlSafety";
import SEO from "../components/SEO";
import Breadcrumbs, { StructuredData } from "../components/Breadcrumbs";
import { breadcrumbJsonLd } from "../lib/structuredData";
import { readPrerenderData } from "../lib/siteSeo";
import { normalizeDogLocation } from "../lib/dogProfileSeo";

function getParam(search, key) {
  const params = new URLSearchParams(search);
  return params.get(key) || "";
}

export default function Shelter() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const sessionId = useMemo(
    () => getParam(location.search, "session"),
    [location.search]
  );

  const initialData = useMemo(() => readPrerenderData("shelterPage"), []);
  const [loading, setLoading] = useState(!initialData?.shelter);
  const [shelter, setShelter] = useState(initialData?.shelter || null);
  const [dogs, setDogs] = useState(
    filterPublicDogs(initialData?.dogs || [])
  );
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      try {
        // Fetch shelter
        const shelterRes = await supabase
          .from("shelters")
          .select("*")
          .eq("id", id)
          .single();

        if (shelterRes.error) throw shelterRes.error;

        // Fetch dogs for this shelter
        const dogsRes = await supabase
          .from("dogs")
          .select("*, shelters ( id, name, city, state, apply_url, website, logo_url )")
          .eq("shelter_id", id)
          .eq("adoptable", true)
          .or("adoption_pending.is.null,adoption_pending.eq.false")
          .in("availability_status", ["available", "active", "unknown"])
          .order("name", { ascending: true });

        if (dogsRes.error) throw dogsRes.error;

        if (!cancelled) {
          setShelter(shelterRes.data);
          setDogs(filterPublicDogs(dogsRes.data));
        }
      } catch (e) {
        if (!cancelled) {
          setError(e?.message || "Unable to load shelter.");
          setShelter(null);
          setDogs([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  function viewDogs() {
    const params = new URLSearchParams();
    params.set("shelter", id);
    if (sessionId) params.set("session", sessionId);

    navigate(`/results?${params.toString()}`);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F1E9] font-['Inter',sans-serif] text-[#183D35] flex flex-col">
        <SiteHeader />
        <div className="p-10 text-[#6F6A66]">Loading shelter…</div>
        <SiteFooter />
      </div>
    );
  }

  if (error || !shelter) {
    return (
      <div className="min-h-screen bg-[#F5F1E9] font-['Inter',sans-serif] text-[#183D35] flex flex-col">
        <SiteHeader />
        <div className="p-10">
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
            {error || "Shelter not found."}
          </div>
        </div>
        <SiteFooter />
      </div>
    );
  }

  const locationLine = normalizeDogLocation(
    [shelter.city, shelter.state].filter(Boolean).join(", ")
  );
  const applyUrl = normalizeExternalUrl(shelter.apply_url || shelter.website || "");
  const shelterTitle = `${shelter.name || "Animal Shelter"} Dogs for Adoption${locationLine ? ` in ${locationLine}` : ""} | Hooman Finder`;
  const shelterDescription = `View current adoptable dogs from ${shelter.name || "this shelter or rescue"}${locationLine ? ` in ${locationLine}` : ""}, with confirmed profile details and links to the official adoption source.`;
  const breadcrumbItems = [
    { label: "Home", to: "/" },
    { label: "Dogs", to: "/dogs" },
    { label: shelter.name || "Shelter", to: `/shelter/${id}` },
  ];

  return (
    <div className="min-h-screen bg-[#F5F1E9] font-['Inter',sans-serif] text-[#183D35] flex flex-col">
      <SEO
        title={shelterTitle}
        description={shelterDescription}
        canonicalPath={`/shelter/${id}`}
        ogImage="/home-hero-dogs.jpg"
        ogImageAlt={`Adoptable dogs from ${shelter.name || "a shelter or rescue"}`}
      />
      <StructuredData
        value={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "CollectionPage",
              name: shelterTitle,
              url: `https://hoomanfinder.com/shelter/${id}`,
              description: shelterDescription,
            },
            breadcrumbJsonLd(breadcrumbItems),
          ],
        }}
      />
      <SiteHeader />

      <div className="mx-auto max-w-6xl w-full px-6 py-10 flex-1">
        <Breadcrumbs items={breadcrumbItems} />
        <button
          onClick={() => navigate(-1)}
          className="text-sm text-[#6F6A66] hover:text-[#183D35]"
        >
          ← Back
        </button>

        {/* Shelter header */}
        <div className="mt-6 rounded-2xl border border-[#C7D4BB] bg-white p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="font-['Fraunces',serif] text-2xl font-semibold text-[#183D35]">
                {shelter.name || "Shelter"}
              </h1>
              {locationLine && (
                <p className="mt-1 text-sm text-[#6F6A66]">{locationLine}</p>
              )}
            </div>

            <div className="flex flex-wrap gap-3">
              {applyUrl && (
                <a
                  href={applyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-[#C7D4BB] bg-white px-4 py-2 text-sm font-semibold text-[#183D35] hover:bg-[#EFE8DC]"
                >
                  Apply / Visit site →
                </a>
              )}

              <button
                onClick={viewDogs}
                className="rounded-full bg-[#183D35] px-5 py-2.5 text-sm font-semibold text-[#F3C982] hover:bg-[#12332C]"
              >
                View dogs →
              </button>
            </div>
          </div>
        </div>

        {/* Dogs preview */}
        <div className="mt-8">
          <h2 className="font-['Fraunces',serif] text-lg font-semibold text-[#183D35]">
            Dogs at this shelter
          </h2>

          {dogs.length === 0 ? (
            <p className="mt-3 text-sm text-[#6F6A66]">
              No dogs currently listed.
            </p>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-3">
              {dogs.slice(0, 6).map((dog) => (
                <DogCard
                  key={dog.id}
                  dog={dog}
                  scorePct={null}
                  showMatch={false}
                />
              ))}
            </div>
          )}

          {dogs.length > 6 && (
            <div className="mt-6">
              <h3 className="font-['Fraunces',serif] text-base font-semibold text-[#183D35]">
                All current dogs from {shelter.name}
              </h3>
              <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                {dogs.map((dog) => (
                  <li key={dog.id}>
                    <Link
                      to={`/dog/${dog.id}`}
                      className="font-semibold text-[#183D35] underline decoration-[#C7D4BB] underline-offset-4 hover:decoration-[#183D35]"
                    >
                      {dog.name || "Adoptable dog"}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}

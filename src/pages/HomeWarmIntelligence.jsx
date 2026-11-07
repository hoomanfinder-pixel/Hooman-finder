import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import SEO from "../components/SEO";
import HomeFeaturedDogsView, { getHomepageFeaturedDogsViewState } from "../components/HomeFeaturedDogsView.js";
import { getDogSourceLocation } from "../lib/dogSource";
import { filterPublicDogs } from "../lib/dogVisibility";
import { normalizeImageUrl } from "../lib/urlSafety";
import { formatAge, resolveAgeYears } from "../utils/formatAge";
import { truncateAtWord } from "../utils/truncateAtWord";
import platformStats from "../generated/platform-stats.json";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const EVIDENCE_LEVELS = [
  { label: "Shelter-listed", title: "Known facts", text: "Structured details supplied with the listing, such as age, size, or stated compatibility.", tone: "bg-[#2490C0]" },
  { label: "From listing bio", title: "Written context", text: "Relevant details found in the dog’s own shelter or rescue biography.", tone: "bg-[#6E8CA0]" },
  { label: "Estimated", title: "Careful estimates", text: "Responsible inferences are labeled as estimates and never override a confirmed fact.", tone: "bg-[#D2A36E]" },
  { label: "Some information unknown", title: "Honest gaps", text: "Missing details stay unknown instead of quietly becoming a positive match signal.", tone: "bg-[#AEB5BA]" },
];

const QUIZ_LENSES = [
  ["01", "Your household", "Children, other animals, and the realities of your space."],
  ["02", "Your everyday rhythm", "Time alone, activity, and the pace of a normal week."],
  ["03", "Your practical preferences", "Age, size, grooming, and the care needs you can support."],
];

const MATCHING_STEPS = [
  ["01", "Start with your life", "Household, routine, and realistic care capacity."],
  ["02", "Compare relevant evidence", "Your preferences meet supported dog information."],
  ["03", "See the limits", "Facts, estimates, and unknowns remain distinct."],
];

const EXAMPLE_EXPLANATIONS = [
  {
    preference: "Daily activity",
    detail: "Moderate energy",
    source: "Shelter-listed",
    note: "May align with your routine",
    tone: "bg-[#2490C0]",
  },
  {
    preference: "Cats at home",
    detail: "May do well with slow introductions",
    source: "From listing bio",
    note: "Ask the shelter about introductions",
    tone: "bg-[#6E8CA0]",
  },
  {
    preference: "Time alone",
    detail: "Not provided",
    source: "Unknown",
    note: "Confirm this before deciding",
    tone: "bg-[#AEB5BA]",
  },
];

function ArrowIcon({ className = "h-4 w-4" }) {
  return <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}><path d="M3 10h13M11 5l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function CheckIcon() {
  return <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4"><path d="m4 10 4 4 8-9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function todaySeed() {
  const date = new Date();
  return Number(`${date.getFullYear()}${date.getMonth() + 1}${date.getDate()}`);
}

function seededValue(input) {
  let hash = 2166136261;
  for (const character of String(input || "")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pickFeaturedDogs(dogs, count = 3) {
  const seed = todaySeed();
  return [...dogs].sort((a, b) => seededValue(`${seed}:${a?.id}`) - seededValue(`${seed}:${b?.id}`)).slice(0, count);
}

function previewImage(rawUrl) {
  const image = normalizeImageUrl(rawUrl, { allowRelative: false });
  if (!image) return "/home-hero-dogs.jpg";
  try {
    const url = new URL(image);
    if (url.hostname === "cdn.rescuegroups.org") url.searchParams.set("width", "720");
    return url.toString();
  } catch {
    return image;
  }
}

function dogMeta(dog) {
  const age = formatAge(resolveAgeYears(dog?.age_years, dog?.age_text));
  const location = getDogSourceLocation(dog, "");
  return [age !== "Unknown" ? age : dog?.age_text, location !== "Location unknown" ? location : ""].filter(Boolean).join(" · ");
}

function dogListingOrganization(dog) {
  return dog?.shelters?.name || dog?.shelter_name || "Listing shelter or rescue";
}

async function fetchHomepageDogs() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error("Missing Supabase configuration");
  const endpoint = new URL(`${SUPABASE_URL}/rest/v1/dogs`);
  endpoint.searchParams.set("select", "*,shelters(id,name,city,state,website,apply_url,logo_url),ingestion_sources(id,source_type,external_org_id,enabled,publication_eligible,last_successful_sync_at)");
  endpoint.searchParams.set("adoptable", "eq.true");
  endpoint.searchParams.set("or", "(adoption_pending.is.null,adoption_pending.eq.false)");
  endpoint.searchParams.set("availability_status", "in.(available,active,unknown)");
  endpoint.searchParams.set("photo_url", "not.is.null");
  endpoint.searchParams.set("order", "created_at.desc");
  endpoint.searchParams.set("limit", "48");
  const response = await fetch(endpoint, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } });
  if (!response.ok) throw new Error(`Dog request failed with status ${response.status}`);
  return response.json();
}

export default function HomeWarmIntelligence() {
  const [featuredDogs, setFeaturedDogs] = useState([]);
  const [dogLoadLoading, setDogLoadLoading] = useState(true);
  const [dogLoadFailed, setDogLoadFailed] = useState(false);

  useEffect(() => {
    let active = true;
    fetchHomepageDogs()
      .then((data) => {
        if (!active) return;
        setFeaturedDogs(pickFeaturedDogs(filterPublicDogs(data).filter((dog) => dog?.id && dog?.photo_url)));
        setDogLoadFailed(false);
      })
      .catch((error) => {
        console.error("Could not load homepage dogs:", error);
        if (active) setDogLoadFailed(true);
      })
      .finally(() => { if (active) setDogLoadLoading(false); });
    return () => { active = false; };
  }, []);

  const previewDogs = useMemo(() => featuredDogs.slice(0, 3), [featuredDogs]);
  const featuredDogsState = getHomepageFeaturedDogsViewState({ count: previewDogs.length, loading: dogLoadLoading, failed: dogLoadFailed });

  return (
    <div className="min-h-screen overflow-hidden bg-[#F7F5F0] font-['Inter',sans-serif] text-[#111D26] selection:bg-[#2490C0]/20">
      <SEO title="Find a Dog Who Fits Your Life | Hooman Finder" description="Discover real adoptable dogs through transparent, lifestyle-based matching with Hooman Finder." canonicalPath="/" ogImage="/home-hero-adopter-dog-hd.jpg" ogImageAlt="A woman sharing a warm moment with a rescue dog" />
      <header className="relative z-30 border-b border-[#111D26]/10 bg-[#F7F5F0]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-[74px] max-w-[1280px] items-center justify-between px-5 sm:h-[86px] sm:px-8 lg:px-12">
          <Link to="/" aria-label="Hooman Finder home" className="flex items-center">
            <img src="/logo.png" alt="Hooman Finder" width="753" height="705" className="h-[50px] w-auto object-contain sm:h-[60px]" />
          </Link>
          <nav aria-label="Primary navigation" className="flex items-center gap-6 text-[13px] font-semibold sm:gap-8">
            <Link to="/dogs" className="hidden rounded-sm hover:text-[#2490C0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#2490C0] sm:inline">Browse dogs</Link>
            <Link to="/about" className="hidden rounded-sm hover:text-[#2490C0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#2490C0] md:inline">How it works</Link>
            <Link to="/quiz" aria-label="Find my potential matches" className="inline-flex min-h-11 items-center rounded-full bg-[#111D26] px-5 text-white hover:bg-[#2490C0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#2490C0] sm:px-6"><span className="sm:hidden">Find matches</span><span className="hidden sm:inline">Find my potential matches</span></Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="relative">
          <div className="mx-auto grid max-w-[1280px] lg:min-h-[690px] lg:grid-cols-[0.92fr_1.08fr]">
            <div className="relative flex flex-col justify-center px-5 pb-10 pt-10 sm:px-8 sm:pb-16 sm:pt-20 lg:px-12 lg:py-24">
              <div className="pointer-events-none absolute left-0 top-0 hidden h-full w-px bg-[#111D26]/10 lg:block" />
              <p className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.2em] text-[#466071]">
                <span className="h-px w-8 bg-[#2490C0]" /> Lifestyle-first dog matching
              </p>
              <h1 className="mt-7 max-w-2xl font-['Fraunces',serif] text-[3.25rem] font-medium leading-[0.95] tracking-[-0.045em] text-[#111D26] sm:text-[4.7rem] lg:text-[5.2rem]">
                Find a dog who fits your life. <span className="text-[#2490C0]">Not just your search.</span>
              </h1>
              <p className="mt-7 max-w-xl text-[15px] leading-7 text-[#52616B] sm:text-[17px] sm:leading-8">
                A thoughtful way to discover real shelter and rescue dogs—using what is known, clearly labeling what is estimated, and keeping unknowns honest.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link to="/quiz" className="group inline-flex min-h-14 items-center justify-center gap-4 rounded-full bg-[#2490C0] px-7 text-sm font-bold text-white shadow-[0_14px_34px_rgba(36,144,192,0.22)] hover:bg-[#147EAC] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#111D26]">
                  Find my potential matches <ArrowIcon className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
                <Link to="/dogs" className="inline-flex min-h-14 items-center justify-center px-5 text-sm font-bold text-[#111D26] hover:text-[#2490C0]">Browse adoptable dogs</Link>
              </div>
              <div className="mt-10 flex flex-wrap gap-x-7 gap-y-3 border-t border-[#111D26]/10 pt-5 text-[11px] font-semibold uppercase tracking-[0.13em] text-[#68757E]">
                <span className="flex items-center gap-2"><CheckIcon /> Free to use</span>
                <span className="flex items-center gap-2"><CheckIcon /> No account required</span>
                <span className="flex items-center gap-2"><CheckIcon /> Real listings</span>
              </div>
            </div>

            <div className="relative min-h-[430px] overflow-hidden bg-[#DDE5E9] sm:min-h-[650px] lg:min-h-full">
              <picture>
                <source type="image/avif" srcSet="/home-hero-adopter-dog-672.avif 672w, /home-hero-adopter-dog-768.avif 768w, /home-hero-adopter-dog.avif 1537w" />
                <img src="/home-hero-adopter-dog-hd.jpg" alt="A woman warmly greeting a rescue dog" width="1537" height="1023" fetchPriority="high" className="absolute inset-0 h-full w-full object-cover object-[45%_50%]" />
              </picture>
              <div className="absolute inset-0 bg-gradient-to-t from-[#111D26]/25 via-transparent to-transparent" />
              <div className="absolute inset-x-4 bottom-4 rounded-[1.35rem] border border-white/60 bg-[#FDFCF9]/92 p-4 shadow-[0_22px_55px_rgba(17,29,38,0.18)] backdrop-blur-xl sm:bottom-8 sm:left-8 sm:right-auto sm:w-[355px] sm:p-5">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#627581]">How evidence is shown</p>
                  <span className="rounded-full bg-[#E5F3F8] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-[#147EAC]">Transparent</span>
                </div>
                <div className="mt-4 space-y-3">
                  {EVIDENCE_LEVELS.slice(0, 3).map((item) => (
                    <div key={item.label} className="flex items-center gap-3">
                      <span className={`h-2.5 w-2.5 rounded-full ${item.tone}`} />
                      <span className="text-xs font-semibold text-[#26343D]">{item.label}</span>
                      <span className="ml-auto text-[11px] text-[#7A858C]">labeled</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-[#111D26]/10 bg-white">
          <div className="mx-auto grid max-w-[1280px] grid-cols-2 divide-x divide-[#111D26]/10 px-5 py-6 sm:px-8 lg:grid-cols-4 lg:px-12">
            <div className="px-3 py-2 sm:px-6"><p className="font-['Fraunces',serif] text-2xl">{platformStats.public_dog_count}</p><p className="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#7A858C]">Current dogs</p></div>
            <div className="px-3 py-2 sm:px-6"><p className="font-['Fraunces',serif] text-2xl">{platformStats.public_shelter_count}</p><p className="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#7A858C]">Listing sources</p></div>
            <div className="mt-5 border-t border-[#111D26]/10 px-3 pt-5 sm:px-6 lg:mt-0 lg:border-t-0 lg:pt-2"><p className="font-['Fraunces',serif] text-2xl">Free</p><p className="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#7A858C]">For adopters</p></div>
            <div className="mt-5 border-t border-[#111D26]/10 px-3 pt-5 sm:px-6 lg:mt-0 lg:border-t-0 lg:pt-2"><p className="font-['Fraunces',serif] text-2xl">Direct</p><p className="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#7A858C]">Official adoption links</p></div>
          </div>
        </section>

        <section className="px-5 py-16 sm:px-8 sm:py-28 lg:px-12">
          <div className="mx-auto max-w-[1180px]">
            <div className="grid items-end gap-8 lg:grid-cols-[0.9fr_1.1fr]">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#2490C0]">How matching works</p>
                <h2 className="mt-5 max-w-xl font-['Fraunces',serif] text-4xl font-medium leading-[1.02] tracking-[-0.03em] sm:text-5xl">Your life first. Then the evidence.</h2>
              </div>
              <p className="max-w-xl text-[15px] leading-7 text-[#5F6D76] lg:ml-auto">Hooman Finder evaluates supported dog information against the preferences relevant to your household. The result is guidance for a better shortlist—not a prediction of adoption success.</p>
            </div>

            <div className="mt-10 grid gap-px overflow-hidden rounded-[1.35rem] border border-[#111D26]/10 bg-[#111D26]/10 sm:grid-cols-3">
              {MATCHING_STEPS.map(([number, title, text]) => (
                <article key={number} className="grid grid-cols-[32px_1fr] gap-3 bg-[#FDFCF9] p-5 sm:block sm:p-7">
                  <span className="pt-1 text-[11px] font-bold text-[#2490C0] sm:pt-0">{number}</span>
                  <div><h3 className="font-['Fraunces',serif] text-xl font-medium sm:mt-5">{title}</h3><p className="mt-1 text-sm leading-6 text-[#68757E] sm:mt-2">{text}</p></div>
                </article>
              ))}
            </div>

            <div className="mt-6 grid overflow-hidden rounded-[1.75rem] border border-[#111D26]/10 bg-white shadow-[0_28px_80px_rgba(24,45,58,0.12)] lg:grid-cols-[0.72fr_1.28fr]">
              <div className="flex flex-col bg-[#152733] p-6 text-white sm:p-10 lg:p-12">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[#77C5E5]" />
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#77C5E5]">Signature match preview</p>
                </div>
                <h3 className="mt-6 font-['Fraunces',serif] text-3xl font-medium leading-tight sm:text-4xl">A match explanation you can actually question.</h3>
                <p className="mt-5 text-sm leading-7 text-white/65">Every result separates what the listing says, what is cautiously estimated, and what still needs a conversation with the shelter.</p>
                <div className="mt-8 border-t border-white/15 pt-5 text-xs leading-5 text-white/48 lg:mt-auto">Illustrative interface using evidence states supported by the current product. It is not a prediction or guarantee.</div>
              </div>

              <div className="bg-[#FDFCF9] p-5 sm:p-8 lg:p-10">
                <div className="flex flex-col gap-3 border-b border-[#111D26]/10 pb-6 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#2490C0]">Example explanation</p>
                    <h3 className="mt-2 font-['Fraunces',serif] text-2xl font-medium sm:text-3xl">What aligns—and what to ask</h3>
                  </div>
                  <span className="w-fit rounded-full border border-[#2490C0]/25 bg-[#EAF5F9] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[#147EAC]">Illustrative</span>
                </div>
                <div className="divide-y divide-[#111D26]/10">
                  {EXAMPLE_EXPLANATIONS.map((item) => (
                    <article key={item.preference} className="grid gap-3 py-5 sm:grid-cols-[120px_1fr] sm:gap-6">
                      <p className="text-xs font-bold uppercase tracking-[0.08em] text-[#728089]">{item.preference}</p>
                      <div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                          <p className="text-sm font-bold text-[#182832]">{item.detail}</p>
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-[#62717A]"><span className={`h-2 w-2 rounded-full ${item.tone}`} />{item.source}</span>
                        </div>
                        <p className="mt-1.5 text-xs leading-5 text-[#718089]">{item.note}</p>
                      </div>
                    </article>
                  ))}
                </div>
                <div className="mt-2 flex items-start gap-3 rounded-xl bg-[#EEF3F5] p-4 text-xs leading-5 text-[#52636D]">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white font-bold text-[#2490C0]">i</span>
                  Match guidance reflects currently available information. Confirm important traits directly with the shelter or foster.
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-[#EAF2F5] px-5 py-14 sm:px-8 sm:py-24 lg:px-12">
          <div className="mx-auto grid max-w-[1180px] gap-12 lg:grid-cols-2 lg:items-center">
            <div className="relative">
              <div className="overflow-hidden rounded-[1.5rem] bg-[#CCDDE4] shadow-[0_24px_65px_rgba(28,64,81,0.14)]">
                <img src="/home-hero-dogs.jpg" alt="Two dogs relaxing outdoors" width="2048" height="1152" loading="lazy" className="aspect-[16/10] h-full w-full object-cover sm:aspect-[4/3]" />
              </div>
              <div className="absolute -bottom-6 right-4 max-w-[230px] rounded-xl bg-[#FDFCF9] p-4 shadow-xl sm:right-8">
                <p className="font-['Fraunces',serif] text-lg leading-tight text-[#111D26]">The best match should work on an ordinary day.</p>
              </div>
            </div>
            <div className="pt-4 lg:pl-10">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#147EAC]">Lifestyle first</p>
              <h2 className="mt-5 font-['Fraunces',serif] text-4xl font-medium leading-[1.03] tracking-[-0.03em] sm:text-5xl">The quiz starts with your Tuesday—not your dream breed.</h2>
              <p className="mt-6 text-[15px] leading-7 text-[#5B6B75]">Your home, schedule, energy, and care preferences create the practical context for a more useful shortlist.</p>
              <div className="mt-8 divide-y divide-[#507180]/20 border-y border-[#507180]/20">
                {QUIZ_LENSES.map(([number, title, text]) => (
                  <div key={number} className="grid grid-cols-[38px_1fr] gap-3 py-4 sm:py-5">
                    <span className="text-xs font-bold text-[#2490C0]">{number}</span>
                    <div><h3 className="text-sm font-bold text-[#172832]">{title}</h3><p className="mt-1 text-sm leading-6 text-[#687983]">{text}</p></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="px-5 py-14 sm:px-8 sm:py-24 lg:px-12">
          <div className="mx-auto max-w-[1180px]">
            <div className="flex items-end justify-between gap-8">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#2490C0]">Available now</p>
                <h2 className="mt-4 font-['Fraunces',serif] text-4xl font-medium tracking-[-0.03em] sm:text-5xl">Meet a few real dogs.</h2>
                <p className="mt-4 max-w-lg text-sm leading-6 text-[#68757E]">Current listings from shelters and rescues represented on Hooman Finder.</p>
              </div>
              <Link to="/dogs" className="group hidden items-center gap-3 text-sm font-bold hover:text-[#2490C0] sm:flex">View all dogs <ArrowIcon className="h-4 w-4 transition-transform group-hover:translate-x-1" /></Link>
            </div>

            <HomeFeaturedDogsView state={featuredDogsState}>
              <div className="mt-10 grid gap-5 sm:grid-cols-3">
                {previewDogs.map((dog, index) => (
                  <Link key={dog.id} to={`/dog/${dog.id}`} aria-label={`${dog.name}, an adoptable dog profile`} className="group grid grid-cols-[112px_minmax(0,1fr)] overflow-hidden rounded-[1.3rem] border border-[#111D26]/10 bg-white shadow-[0_14px_40px_rgba(17,29,38,0.06)] hover:-translate-y-1 hover:shadow-[0_20px_50px_rgba(17,29,38,0.12)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#2490C0] sm:block">
                    <div className="relative aspect-square overflow-hidden bg-[#E6ECEE] sm:aspect-[4/3]">
                      <img src={previewImage(dog.photo_url)} alt={`${dog.name}, an adoptable dog`} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = "/home-hero-dogs.jpg"; }} />
                      {index === 0 ? <span className="absolute left-4 top-4 hidden rounded-full bg-white/92 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[#26343D] backdrop-blur sm:block">Current listing</span> : null}
                    </div>
                    <div className="flex min-w-0 items-end justify-between gap-3 p-4 sm:gap-4 sm:p-5">
                      <div className="min-w-0"><h3 className="font-['Fraunces',serif] text-xl font-medium sm:text-2xl">{truncateAtWord(dog.name, 28)}</h3><p className="mt-1 text-xs text-[#748087]">{dogMeta(dog)}</p><p className="mt-2 line-clamp-2 text-[11px] font-semibold uppercase leading-4 tracking-[0.06em] text-[#52636D] sm:truncate">Listed by {dogListingOrganization(dog)}</p></div>
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#111D26]/15 text-[#2490C0] transition group-hover:border-[#2490C0] group-hover:bg-[#2490C0] group-hover:text-white sm:h-10 sm:w-10"><ArrowIcon /></span>
                    </div>
                  </Link>
                ))}
              </div>
              <Link to="/dogs" className="mt-6 inline-flex items-center gap-3 text-sm font-bold sm:hidden">View all dogs <ArrowIcon /></Link>
            </HomeFeaturedDogsView>
          </div>
        </section>

        <section className="bg-[#142631] px-5 py-14 text-white sm:px-8 sm:py-24 lg:px-12">
          <div className="mx-auto max-w-[1180px]">
            <div className="grid gap-10 lg:grid-cols-[0.72fr_1.28fr]">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#77C5E5]">Trust is part of the product</p>
                <h2 className="mt-5 font-['Fraunces',serif] text-4xl font-medium leading-[1.04] tracking-[-0.03em] sm:text-5xl">Clarity before certainty.</h2>
                <p className="mt-6 max-w-md text-sm leading-7 text-white/60">A match is a starting point for better questions, not a promise about a living animal.</p>
              </div>
              <div className="grid gap-px overflow-hidden rounded-[1.25rem] bg-white/15 sm:grid-cols-2">
                {[
                  ["Known", "Confirmed listing details are treated as the strongest source."],
                  ["Estimated", "Inferences are marked and do not override structured facts."],
                  ["Unknown", "Missing information remains visible instead of boosting a score."],
                  ["Official next step", "Applications and final decisions stay with the listing shelter or rescue."],
                ].map(([title, text], index) => (
                  <article key={title} className="bg-[#1B303C] p-5 sm:p-7">
                    <span className="text-[11px] font-bold text-[#77C5E5]">0{index + 1}</span>
                    <h3 className="mt-4 font-['Fraunces',serif] text-2xl font-medium sm:mt-5">{title}</h3>
                    <p className="mt-3 text-sm leading-6 text-white/60">{text}</p>
                  </article>
                ))}
              </div>
            </div>
            <div className="mt-12 flex flex-col gap-4 border-t border-white/15 pt-6 text-xs leading-5 text-white/50 sm:flex-row sm:items-center sm:justify-between">
              <p>Always confirm availability, behavior, requirements, and fit directly with the shelter or rescue.</p>
              <Link to="/about" className="shrink-0 font-bold text-white hover:text-[#77C5E5]">How Hooman Finder works →</Link>
            </div>
          </div>
        </section>

        <section className="px-5 py-8 sm:px-8 sm:py-16 lg:px-12">
          <div className="mx-auto grid max-w-[1180px] overflow-hidden rounded-[1.75rem] bg-[#2490C0] lg:grid-cols-[1.08fr_0.92fr]">
            <div className="flex flex-col justify-center p-7 text-white sm:p-12 lg:p-16">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/70">Your shortlist starts here</p>
              <h2 className="mt-5 max-w-xl font-['Fraunces',serif] text-4xl font-medium leading-[1.02] tracking-[-0.03em] sm:text-5xl">Make the search feel more human—and more informed.</h2>
              <p className="mt-5 max-w-lg text-sm leading-7 text-white/78">Answer a short lifestyle quiz, review the evidence behind each result, and continue with the official adoption source.</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link to="/quiz" className="group inline-flex min-h-14 items-center justify-center gap-4 rounded-full bg-white px-7 text-sm font-bold text-[#147EAC] hover:bg-[#EAF5F9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#111D26]">Find my potential matches <ArrowIcon className="h-4 w-4 transition-transform group-hover:translate-x-1" /></Link>
                <Link to="/dogs" className="inline-flex min-h-14 items-center justify-center rounded-full border border-white/50 px-7 text-sm font-bold text-white hover:bg-white hover:text-[#147EAC] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">Browse dogs</Link>
              </div>
            </div>
            <div className="relative min-h-[300px] lg:min-h-[470px]">
              <img src="/home-cta-dog.jpg" alt="A dog looking attentively to the side" width="700" height="350" loading="lazy" className="absolute inset-0 h-full w-full object-cover object-center" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#2490C0]/35 to-transparent" />
            </div>
          </div>
        </section>
      </main>
      <footer className="border-t border-[#111D26]/10 bg-[#F7F5F0] px-5 py-8 sm:px-8 sm:py-10 lg:px-12">
        <div className="mx-auto max-w-[1180px]">
          <div className="grid gap-10 sm:grid-cols-[1fr_auto]">
            <div>
              <Link to="/" aria-label="Hooman Finder home" className="inline-flex"><img src="/logo.png" alt="Hooman Finder" width="753" height="705" loading="lazy" className="h-16 w-auto" /></Link>
              <p className="mt-4 max-w-md text-sm leading-6 text-[#68757E]">Lifestyle-based discovery for real adoptable dogs. Free for adopters, with the adoption process managed by each listing shelter or rescue.</p>
            </div>
            <nav aria-label="Footer" className="grid grid-cols-2 gap-x-10 gap-y-3 text-sm font-semibold text-[#43525B] sm:grid-cols-3">
              <Link to="/dogs" className="hover:text-[#2490C0]">Browse dogs</Link>
              <Link to="/about" className="hover:text-[#2490C0]">About</Link>
              <Link to="/contact" className="hover:text-[#2490C0]">Contact</Link>
              <Link to="/shelters/join" className="hover:text-[#2490C0]">For shelters</Link>
              <Link to="/privacy" className="hover:text-[#2490C0]">Privacy</Link>
              <Link to="/terms" className="hover:text-[#2490C0]">Terms</Link>
            </nav>
          </div>
          <div className="mt-10 flex flex-col gap-3 border-t border-[#111D26]/10 pt-5 text-[11px] leading-5 text-[#7A858C] sm:flex-row sm:items-center sm:justify-between">
            <p>© {new Date().getFullYear()} Hooman Finder</p>
            <p>Match guidance is not a guarantee. Confirm all details with the listing organization.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import SEO from "../components/SEO";
import HomeFeaturedDogsView, {
  getHomepageFeaturedDogsViewState,
} from "../components/HomeFeaturedDogsView.js";
import {
  getDogApplyLabel,
  getDogApplyLink,
  getDogSourceLocation,
} from "../lib/dogSource";
import { filterPublicDogs } from "../lib/dogVisibility";
import { trackAdoptionLinkClick } from "../lib/googleAnalytics";
import { normalizeImageUrl } from "../lib/urlSafety";
import { formatAge, resolveAgeYears } from "../utils/formatAge";
import { truncateAtWord } from "../utils/truncateAtWord";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const HOW_IT_WORKS = [
  {
    number: "01",
    title: "Tell us about your life.",
    text: "Share the household, routine, and care preferences that shape an ordinary week.",
  },
  {
    number: "02",
    title: "Discover potential matches.",
    text: "Explore real adoptable dogs using the listing details that are currently available.",
  },
  {
    number: "03",
    title: "Connect with the shelter or rescue.",
    text: "Continue through the official listing to ask questions and begin the adoption process.",
  },
];

const LIFESTYLE_DETAILS = [
  ["Home", "Children, other animals, and the realities of your space."],
  ["Routine", "Time alone, activity, and the rhythm of a normal week."],
  ["Energy", "The pace and exercise needs you can support consistently."],
  ["Training", "Your experience, expectations, and willingness to keep learning together."],
];

const TRUST_LEVELS = [
  ["Known", "Source-listed facts lead the experience."],
  ["Estimated", "Careful inferences are clearly labeled."],
  ["Unknown", "Missing information stays visible."],
];

function ArrowIcon({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
      <path d="M3 10h13M11 5l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PawIcon() {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" className="h-7 w-7">
      <ellipse cx="16" cy="21" rx="8" ry="6" fill="currentColor" />
      <ellipse cx="7.5" cy="14" rx="3" ry="4" fill="currentColor" />
      <ellipse cx="14" cy="9" rx="3" ry="4" fill="currentColor" />
      <ellipse cx="24.5" cy="14" rx="3" ry="4" fill="currentColor" />
      <ellipse cx="20" cy="9" rx="3" ry="4" fill="currentColor" />
    </svg>
  );
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

function pickFeaturedDogs(dogs, count = 12) {
  const seed = todaySeed();
  return [...dogs]
    .sort((a, b) => seededValue(`${seed}:${a?.id}`) - seededValue(`${seed}:${b?.id}`))
    .slice(0, count);
}

function previewImage(rawUrl) {
  const image = normalizeImageUrl(rawUrl, { allowRelative: false });
  if (!image) return "";
  try {
    const url = new URL(image);
    if (url.hostname === "cdn.rescuegroups.org") url.searchParams.set("width", "720");
    return url.toString();
  } catch {
    return image;
  }
}

function homepageImageCandidates(dog) {
  const extraImages = Array.isArray(dog?.photo_urls) ? dog.photo_urls : [];
  return Array.from(
    new Set([dog?.photo_url, ...extraImages].map(previewImage).filter(Boolean))
  );
}

function HomepageDogPhoto({ dog, onUnavailable }) {
  const candidates = useMemo(() => homepageImageCandidates(dog), [dog]);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const image = candidates[candidateIndex];

  function handleImageError() {
    if (candidateIndex + 1 < candidates.length) {
      setCandidateIndex((index) => index + 1);
      return;
    }
    onUnavailable(dog.id);
  }

  if (!image) return null;

  return (
    <img
      src={image}
      alt={`${dog.name}, an adoptable dog`}
      width="720"
      height="900"
      loading="lazy"
      className="relative h-full w-full object-cover transition duration-500 group-hover:scale-[1.025] motion-reduce:transition-none"
      onError={handleImageError}
    />
  );
}

function dogDetails(dog) {
  const age = formatAge(resolveAgeYears(dog?.age_years, dog?.age_text));
  const location = getDogSourceLocation(dog, "");
  return [
    age !== "Unknown" ? age : dog?.age_text,
    dog?.size,
    location !== "Location unknown" ? location : "",
  ].filter(Boolean).join(" · ");
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
  const response = await fetch(endpoint, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  });
  if (!response.ok) throw new Error(`Dog request failed with status ${response.status}`);
  return response.json();
}

export default function HomeWarmIntelligence() {
  const [featuredDogs, setFeaturedDogs] = useState([]);
  const [unavailableDogIds, setUnavailableDogIds] = useState(() => new Set());
  const [dogLoadLoading, setDogLoadLoading] = useState(true);
  const [dogLoadFailed, setDogLoadFailed] = useState(false);
  const pageRef = useRef(null);
  const carouselRef = useRef(null);

  useEffect(() => {
    let active = true;
    fetchHomepageDogs()
      .then((data) => {
        if (!active) return;
        setFeaturedDogs(
          pickFeaturedDogs(
            filterPublicDogs(data).filter(
              (dog) => dog?.id && homepageImageCandidates(dog).length > 0
            )
          )
        );
        setDogLoadFailed(false);
      })
      .catch((error) => {
        console.error("Could not load homepage dogs:", error);
        if (active) setDogLoadFailed(true);
      })
      .finally(() => { if (active) setDogLoadLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const root = pageRef.current;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!root || reducedMotion || !("IntersectionObserver" in window)) return undefined;

    const items = [...root.querySelectorAll("[data-home-reveal]")];
    root.classList.add("hf-home-motion");
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -8%", threshold: 0.08 });

    items.forEach((item) => observer.observe(item));
    return () => {
      observer.disconnect();
      root.classList.remove("hf-home-motion");
    };
  }, []);

  const previewDogs = useMemo(
    () => featuredDogs.filter((dog) => !unavailableDogIds.has(dog.id)).slice(0, 6),
    [featuredDogs, unavailableDogIds]
  );
  const featuredDogsState = getHomepageFeaturedDogsViewState({ count: previewDogs.length, loading: dogLoadLoading, failed: dogLoadFailed });

  function markDogImageUnavailable(dogId) {
    setUnavailableDogIds((current) => {
      if (current.has(dogId)) return current;
      const next = new Set(current);
      next.add(dogId);
      return next;
    });
  }

  function scrollCarousel(direction) {
    const carousel = carouselRef.current;
    if (!carousel) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    carousel.scrollBy({
      left: direction * Math.min(carousel.clientWidth * 0.82, 360),
      behavior: reducedMotion ? "auto" : "smooth",
    });
  }

  return (
    <div ref={pageRef} className="min-h-screen overflow-x-clip bg-[#F7F5EF] font-['Inter',sans-serif] text-[#294F46] selection:bg-[#2490C0]/20">
      <SEO title="Find a Dog Who Fits Your Life | Hooman Finder" description="Discover real adoptable dogs through transparent, lifestyle-based matching with Hooman Finder." canonicalPath="/" ogImage="/home-hero-adopter-dog-hd.jpg" ogImageAlt="A woman sharing a warm moment with a rescue dog" />

      <header className="absolute inset-x-0 top-0 z-30">
        <div className="mx-auto flex h-[72px] max-w-[1280px] items-center justify-between gap-3 px-4 sm:h-[88px] sm:px-8 lg:px-12">
          <Link to="/" aria-label="Hooman Finder home" className="inline-flex h-12 items-center rounded-2xl border border-white/60 bg-[#F7F5EF]/92 px-2.5 shadow-[0_8px_30px_rgba(16,40,34,0.13)] backdrop-blur-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white sm:h-14 sm:px-3">
            <img src="/logo.png" alt="Hooman Finder" width="753" height="705" className="h-10 w-auto object-contain sm:h-12" />
          </Link>
          <nav aria-label="Primary navigation" className="flex items-center gap-2 sm:gap-3">
            <Link to="/dogs" className="hidden min-h-11 items-center rounded-full border border-white/55 bg-[#F7F5EF]/88 px-5 text-sm font-bold text-[#294F46] backdrop-blur-xl hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white sm:inline-flex">Browse dogs</Link>
            <Link to="/quiz" className="inline-flex min-h-11 items-center rounded-full bg-[#294F46] px-4 text-[12px] font-bold text-white shadow-[0_8px_26px_rgba(16,40,34,0.22)] hover:bg-[#1E3F37] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white sm:px-6 sm:text-sm">Take the Quiz</Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="relative flex min-h-[720px] items-end overflow-hidden bg-[#183A32] sm:min-h-[760px] lg:min-h-[780px] lg:items-center">
          <picture className="absolute inset-0">
            <source type="image/avif" srcSet="/home-hero-adopter-dog-480.avif 480w, /home-hero-adopter-dog-672.avif 672w, /home-hero-adopter-dog-768.avif 768w, /home-hero-adopter-dog.avif 1537w" sizes="100vw" />
            <source type="image/webp" srcSet="/home-hero-adopter-dog-480.webp 480w, /home-hero-adopter-dog-672.webp 672w, /home-hero-adopter-dog-768.webp 768w, /home-hero-adopter-dog-1537.webp 1537w" sizes="100vw" />
            <img src="/home-hero-adopter-dog-hd.jpg" alt="A woman sharing a warm moment with a rescue dog" width="1537" height="1023" fetchPriority="high" className="h-full w-full object-cover object-[34%_center] sm:object-[42%_48%] lg:object-center" />
          </picture>
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(14,35,30,0.06)_0%,rgba(14,35,30,0.02)_26%,rgba(14,35,30,0.62)_57%,rgba(14,35,30,0.97)_84%,#183A32_100%)] lg:bg-[linear-gradient(90deg,rgba(14,35,30,0.94)_0%,rgba(14,35,30,0.76)_38%,rgba(14,35,30,0.2)_68%,rgba(14,35,30,0.04)_100%)]" />
          <div className="absolute inset-x-0 bottom-0 h-[62%] bg-gradient-to-t from-[#183A32] via-[#183A32]/56 to-transparent lg:hidden" />
          <div className="relative z-10 mx-auto w-full max-w-[1280px] px-5 pb-14 pt-32 sm:px-8 sm:pb-24 lg:px-12 lg:py-32">
            <div className="hf-home-hero-content max-w-[680px] border-l border-[#54ADD1]/70 pl-4 text-white sm:border-l-0 sm:pl-0">
              <p className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.19em] text-[#BFDAD1] sm:text-[11px]"><span className="hidden h-px w-8 bg-[#54ADD1] sm:block" /> Real dogs. Real routines.</p>
              <h1 className="mt-4 max-w-[660px] font-['Fraunces',serif] text-[clamp(2.7rem,12.5vw,4rem)] font-medium leading-[0.94] tracking-[-0.045em] text-[#FFFDF8] sm:mt-7 sm:text-[5.2rem] lg:text-[5.7rem]">Find a rescue dog who fits your life.</h1>
              <p className="mt-4 max-w-[580px] text-[15px] leading-6 text-white/82 sm:mt-7 sm:text-lg sm:leading-8">Discover adoptable dogs who may fit your home, routine, and everyday lifestyle.</p>
              <div className="mt-6 flex flex-col items-stretch gap-3 sm:mt-9 sm:flex-row sm:items-center sm:gap-5">
                <Link to="/quiz" className="group inline-flex min-h-14 items-center justify-center gap-3 rounded-full bg-[#2490C0] px-6 text-[13px] font-black uppercase tracking-[0.09em] text-white shadow-[0_16px_38px_rgba(0,0,0,0.24)] hover:bg-[#147EAC] active:scale-[0.985] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white sm:px-8">Take the Matching Quiz <ArrowIcon className="h-4 w-4 transition-transform group-hover:translate-x-1" /></Link>
                <Link to="/dogs" className="inline-flex min-h-11 items-center justify-center gap-2 text-sm font-bold text-white/85 underline decoration-white/35 underline-offset-4 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">Browse adoptable dogs <ArrowIcon className="h-3.5 w-3.5" /></Link>
              </div>
              <p className="mt-4 max-w-lg text-[10px] leading-4 text-white/58 sm:mt-5 sm:text-xs sm:leading-5">Free to use · No account required · Match guidance is not a guarantee.</p>
            </div>
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 rounded-t-[100%] bg-[#DCE8DF] sm:h-14" />
        </section>

        <section className="relative bg-[#DCE8DF] px-0 pb-20 pt-14 sm:pb-28 sm:pt-20" aria-labelledby="adoptable-dogs-title">
          <div className="mx-auto max-w-[1280px]" data-home-reveal>
            <div className="flex items-end justify-between gap-5 px-5 sm:px-8 lg:px-12">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#287EA3]">Available now</p>
                <h2 id="adoptable-dogs-title" className="mt-4 font-['Fraunces',serif] text-[2.5rem] font-medium leading-[0.98] tracking-[-0.035em] text-[#294F46] sm:text-5xl">Meet adoptable dogs.</h2>
                <p className="mt-4 max-w-xl text-sm leading-6 text-[#5A6F67] sm:text-[15px]">A small selection of current listings from shelters and rescues represented on Hooman Finder.</p>
              </div>
              <div className="hidden shrink-0 gap-2 sm:flex" aria-label="Adoptable dog carousel controls">
                <button type="button" onClick={() => scrollCarousel(-1)} aria-label="Scroll adoptable dogs backward" aria-controls="homepage-dog-carousel" className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-[#294F46]/20 bg-[#F7F5EF] text-[#294F46] hover:border-[#294F46] hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#2490C0]"><ArrowIcon className="h-4 w-4 rotate-180" /></button>
                <button type="button" onClick={() => scrollCarousel(1)} aria-label="Scroll adoptable dogs forward" aria-controls="homepage-dog-carousel" className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-[#294F46]/20 bg-[#F7F5EF] text-[#294F46] hover:border-[#294F46] hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#2490C0]"><ArrowIcon /></button>
              </div>
            </div>

            <HomeFeaturedDogsView state={featuredDogsState}>
              <div id="homepage-dog-carousel" ref={carouselRef} className="hf-home-carousel mt-9 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-5 sm:mt-11 sm:gap-5 sm:px-8 lg:px-12" role="region" aria-label="Featured adoptable dogs" tabIndex="0">
                {previewDogs.map((dog) => {
                  const officialListingUrl = getDogApplyLink(dog);
                  return (
                    <article key={dog.id} className="group w-[82vw] max-w-[328px] shrink-0 snap-start overflow-hidden rounded-[1.7rem] border border-[#294F46]/10 bg-[#F7F5EF] shadow-[0_18px_50px_rgba(41,79,70,0.12)] transition hover:-translate-y-1 hover:shadow-[0_24px_58px_rgba(41,79,70,0.18)] active:scale-[0.985] motion-reduce:transition-none sm:w-[320px]">
                      <Link to={`/dog/${dog.id}`} aria-label={`${dog.name}, an adoptable dog profile`} className="block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[#2490C0]">
                        <div className="relative aspect-[5/6] overflow-hidden bg-[#C6D8CD]">
                          <div className="absolute inset-0 flex items-center justify-center text-[#294F46]/28"><PawIcon /></div>
                          <HomepageDogPhoto dog={dog} onUnavailable={markDogImageUnavailable} />
                          <span className="absolute left-4 top-4 rounded-full border border-white/55 bg-[#F7F5EF]/92 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-[#294F46] backdrop-blur">Current listing</span>
                        </div>
                        <div className="p-5 pb-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0"><h3 className="truncate font-['Fraunces',serif] text-[1.8rem] font-medium leading-none text-[#294F46]">{truncateAtWord(dog.name, 28)}</h3><p className="mt-2 line-clamp-2 min-h-10 text-xs leading-5 text-[#60736C]">{dogDetails(dog) || "Details available on profile"}</p></div>
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#294F46]/18 text-[#2490C0] transition group-hover:border-[#2490C0] group-hover:bg-[#2490C0] group-hover:text-white"><ArrowIcon /></span>
                          </div>
                          <p className="mt-4 border-t border-[#294F46]/10 pt-3 text-[10px] font-black uppercase leading-4 tracking-[0.08em] text-[#5D7069]">Listed by {dogListingOrganization(dog)}</p>
                        </div>
                      </Link>
                      {officialListingUrl ? (
                        <a href={officialListingUrl} target="_blank" rel="noreferrer" onClick={() => trackAdoptionLinkClick()} className="flex min-h-11 items-center justify-between border-t border-[#294F46]/10 px-5 text-[11px] font-black uppercase tracking-[0.08em] text-[#287EA3] hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[#2490C0]">
                          {getDogApplyLabel(dog)} <ArrowIcon className="h-3.5 w-3.5" />
                        </a>
                      ) : null}
                    </article>
                  );
                })}
              </div>
              <div className="mt-3 flex items-center justify-between gap-4 px-5 sm:px-8 lg:px-12">
                <p className="text-xs text-[#667971]">Swipe or use Tab to explore current listings.</p>
                <Link to="/dogs" className="group inline-flex min-h-11 shrink-0 items-center gap-2 text-sm font-bold text-[#294F46] hover:text-[#147EAC]">View all dogs <ArrowIcon className="h-4 w-4 transition-transform group-hover:translate-x-1" /></Link>
              </div>
            </HomeFeaturedDogsView>
          </div>
        </section>

        <section className="relative -mt-8 rounded-t-[2.75rem] bg-[#F7F5EF] px-5 pb-20 pt-16 sm:-mt-12 sm:rounded-t-[4.5rem] sm:px-8 sm:pb-24 sm:pt-24 lg:px-12" aria-labelledby="how-it-works-title">
          <div className="mx-auto max-w-[1180px]" data-home-reveal>
            <div className="max-w-2xl">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#2490C0]">How it works</p>
              <h2 id="how-it-works-title" className="mt-4 font-['Fraunces',serif] text-[2.35rem] font-medium leading-[1] tracking-[-0.035em] text-[#294F46] sm:text-5xl">One thoughtful starting point. Three simple steps.</h2>
            </div>
            <ol className="mt-8 divide-y divide-[#294F46]/12 border-y border-[#294F46]/12 lg:grid lg:grid-cols-3 lg:divide-x lg:divide-y-0">
              {HOW_IT_WORKS.map((step) => (
                <li key={step.number} className="grid grid-cols-[46px_1fr] gap-3 py-5 first:lg:pl-0 last:lg:pr-0 lg:block lg:px-8 lg:py-8">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#DCE8DF] text-[10px] font-black tracking-[0.08em] text-[#294F46]">{step.number}</span>
                  <div><h3 className="font-['Fraunces',serif] text-[1.35rem] font-medium leading-tight text-[#294F46] lg:mt-4">{step.title}</h3><p className="mt-1.5 text-sm leading-6 text-[#5F716B]">{step.text}</p></div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="relative bg-[#F7F5EF] px-5 py-20 sm:px-8 sm:py-28 lg:px-12" aria-labelledby="why-lifestyle-title">
          <div className="mx-auto grid max-w-[1180px] gap-12 lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:gap-20" data-home-reveal>
            <div className="relative">
              <div className="overflow-hidden rounded-[2rem] rounded-br-[5rem] bg-[#DCE8DF] shadow-[0_24px_70px_rgba(41,79,70,0.14)]">
                <img src="/home-hero-dogs.jpg" alt="Two dogs relaxing outdoors" width="2048" height="1152" loading="lazy" className="aspect-[5/4] h-full w-full object-cover" />
              </div>
              <div className="absolute -bottom-6 left-5 right-5 rounded-[1.35rem] border border-[#294F46]/10 bg-[#F7F5EF] p-4 shadow-[0_18px_44px_rgba(41,79,70,0.15)] sm:left-auto sm:right-8 sm:max-w-[275px] sm:p-5"><p className="font-['Fraunces',serif] text-xl font-medium leading-tight text-[#294F46]">A good shortlist starts with the life you actually live.</p></div>
            </div>
            <div className="pt-6 lg:pt-0">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#2490C0]">Why lifestyle matching matters</p>
              <h2 id="why-lifestyle-title" className="mt-4 font-['Fraunces',serif] text-[2.5rem] font-medium leading-[0.99] tracking-[-0.035em] text-[#294F46] sm:text-5xl">Compatibility lives in the everyday details.</h2>
              <p className="mt-6 text-[15px] leading-7 text-[#5E716A]">Household needs, routine, energy, training expectations, and care preferences can help adopters explore dogs whose known needs may better align with daily life.</p>
              <div className="mt-8 divide-y divide-[#294F46]/12 border-y border-[#294F46]/12">
                {LIFESTYLE_DETAILS.map(([title, text], index) => (
                  <div key={title} className="grid grid-cols-[34px_76px_1fr] gap-3 py-4 sm:grid-cols-[38px_92px_1fr] sm:py-5"><span className="text-[11px] font-black text-[#2490C0]">0{index + 1}</span><h3 className="text-sm font-bold text-[#294F46]">{title}</h3><p className="text-sm leading-6 text-[#667870]">{text}</p></div>
                ))}
              </div>
              <p className="mt-7 rounded-2xl border border-[#294F46]/10 bg-[#EEF3EA] p-4 text-xs leading-5 text-[#5C6E67]">Hooman Finder’s mission is to support more informed conversations and help reduce unsuitable matches and returns. It does not predict or guarantee adoption outcomes.</p>
            </div>
          </div>
        </section>

        <section className="px-4 pb-2 sm:px-8 lg:px-12" aria-labelledby="trust-title">
          <div className="mx-auto max-w-[1180px] overflow-hidden rounded-[2rem] bg-[#173D35] px-6 py-8 text-white sm:rounded-[2.75rem] sm:px-10 sm:py-11 lg:px-12" data-home-reveal>
            <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#8CC9E1]">Transparent by design</p>
                <h2 id="trust-title" className="mt-3 font-['Fraunces',serif] text-[2.15rem] font-medium leading-[0.98] tracking-[-0.035em] text-[#FFFDF8] sm:text-4xl">Clear about what we know.</h2>
                <p className="mt-4 max-w-md text-sm leading-6 text-white/65">Important details still belong in a conversation with the listing shelter or rescue.</p>
              </div>
              <div className="grid gap-px overflow-hidden rounded-[1.35rem] border border-white/12 bg-white/12 sm:grid-cols-3">
                {TRUST_LEVELS.map(([title, text], index) => (
                  <article key={title} className="bg-[#214A41] p-4 sm:min-h-40 sm:p-5">
                    <div className="flex items-center gap-2">
                      <span className={["h-2.5 w-2.5 rounded-full", index === 0 ? "bg-[#54ADD1]" : index === 1 ? "bg-[#D8B47A]" : "bg-white/45"].join(" ")} />
                      <h3 className="text-xs font-black uppercase tracking-[0.1em] text-white">{title}</h3>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-white/65">{text}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 pb-5 pt-16 sm:px-8 sm:pb-10 sm:pt-24 lg:px-12" aria-labelledby="final-cta-title">
          <div className="mx-auto grid max-w-[1180px] overflow-hidden rounded-[2.2rem] bg-[#294F46] shadow-[0_30px_90px_rgba(41,79,70,0.22)] sm:rounded-[3rem] lg:grid-cols-[1.08fr_0.92fr]" data-home-reveal>
            <div className="flex flex-col justify-center p-7 text-white sm:p-12 lg:p-16">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#9FD1E4]">Begin with your real life</p>
              <h2 id="final-cta-title" className="mt-4 max-w-xl font-['Fraunces',serif] text-[2.65rem] font-medium leading-[0.96] tracking-[-0.035em] text-[#FFFDF8] sm:text-5xl">Your next chapter could have four paws.</h2>
              <p className="mt-5 max-w-lg text-sm leading-7 text-white/70">Answer a short lifestyle quiz, explore potential matches, and continue with the official shelter or rescue.</p>
              <Link to="/quiz" className="group mt-7 inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-full bg-[#2490C0] px-7 text-[13px] font-black uppercase tracking-[0.09em] text-white hover:bg-[#147EAC] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white sm:w-fit">Find My Match <ArrowIcon className="h-4 w-4 transition-transform group-hover:translate-x-1" /></Link>
            </div>
            <div className="relative min-h-[260px] sm:min-h-[360px] lg:min-h-[470px]">
              <img src="/home-cta-dog.jpg" alt="A dog looking attentively to the side" width="700" height="350" loading="lazy" className="absolute inset-0 h-full w-full object-cover object-[58%_center]" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#294F46]/50 via-transparent to-transparent lg:bg-gradient-to-r lg:from-[#294F46]/42 lg:to-transparent" />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#294F46]/10 bg-[#F7F5EF] px-5 py-9 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-[1180px]">
          <div className="grid gap-8 sm:grid-cols-[1fr_auto] sm:items-start">
            <div><Link to="/" aria-label="Hooman Finder home" className="inline-flex"><img src="/logo.png" alt="Hooman Finder" width="753" height="705" loading="lazy" className="h-16 w-auto" /></Link><p className="mt-3 max-w-md text-sm leading-6 text-[#687A73]">Lifestyle-based discovery for real adoptable dogs. Adoption decisions and applications remain with each listing shelter or rescue.</p></div>
            <nav aria-label="Footer" className="grid grid-cols-2 gap-x-8 text-sm font-semibold text-[#4F655D] sm:grid-cols-3 sm:gap-y-2">
              {[["Browse dogs", "/dogs"], ["About", "/about"], ["Contact", "/contact"], ["For shelters", "/shelters/join"], ["Privacy", "/privacy"], ["Terms", "/terms"]].map(([label, to]) => <Link key={label} to={to} className="inline-flex min-h-11 items-center hover:text-[#2490C0] sm:min-h-9">{label}</Link>)}
            </nav>
          </div>
          <div className="mt-8 flex flex-col gap-2 border-t border-[#294F46]/10 pt-5 text-[11px] leading-5 text-[#778780] sm:flex-row sm:items-center sm:justify-between"><p>© {new Date().getFullYear()} Hooman Finder</p><p>Match guidance is not a guarantee. Confirm all details with the listing organization.</p></div>
        </div>
      </footer>
    </div>
  );
}

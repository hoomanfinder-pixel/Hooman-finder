import { useEffect } from "react";

const SITE_URL = "https://hoomanfinder.com";
const DEFAULT_IMAGE = `${SITE_URL}/home-hero-dogs.jpg`;
const DEFAULT_DESCRIPTION =
  "Hooman Finder helps you compare adoptable rescue dogs by lifestyle fit, home, routine, energy, and care needs.";
const DEFAULT_IMAGE_ALT = "Rescue dogs looking for their future home";

function absoluteUrl(value) {
  if (!value) return "";
  if (value.startsWith("https://")) return value;
  if (value.startsWith("/")) return `${SITE_URL}${value}`;
  return "";
}

function upsertMeta(selector, attributes) {
  let element = document.head.querySelector(selector);

  if (!element) {
    element = document.createElement("meta");
    document.head.appendChild(element);
  }

  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, value);
  });

  element.setAttribute("data-hooman-seo", "true");
}

function upsertCanonical(href) {
  let element = document.head.querySelector('link[rel="canonical"]');

  if (!element) {
    element = document.createElement("link");
    element.setAttribute("rel", "canonical");
    document.head.appendChild(element);
  }

  element.setAttribute("href", href);
  element.setAttribute("data-hooman-seo", "true");
}

function removeManagedRobots() {
  const element = document.head.querySelector('meta[name="robots"][data-hooman-seo="true"]');
  if (element) element.remove();
}

export default function SEO({
  title,
  description = DEFAULT_DESCRIPTION,
  canonicalPath = "/",
  canonicalUrl,
  ogTitle,
  ogDescription,
  ogImage = DEFAULT_IMAGE,
  ogImageAlt,
  twitterTitle,
  twitterDescription,
  noindex = false,
}) {
  useEffect(() => {
    const safeTitle = title || "Hooman Finder";
    const safeDescription = description || DEFAULT_DESCRIPTION;
    const canonical = canonicalUrl || absoluteUrl(canonicalPath) || SITE_URL;
    const image = absoluteUrl(ogImage) || DEFAULT_IMAGE;
    const imageAlt = ogImageAlt || DEFAULT_IMAGE_ALT;

    document.title = safeTitle;
    upsertCanonical(canonical);

    upsertMeta('meta[name="description"]', {
      name: "description",
      content: safeDescription,
    });

    upsertMeta('meta[property="og:type"]', {
      property: "og:type",
      content: "website",
    });
    upsertMeta('meta[property="og:site_name"]', {
      property: "og:site_name",
      content: "Hooman Finder",
    });
    upsertMeta('meta[property="og:title"]', {
      property: "og:title",
      content: ogTitle || safeTitle,
    });
    upsertMeta('meta[property="og:description"]', {
      property: "og:description",
      content: ogDescription || safeDescription,
    });
    upsertMeta('meta[property="og:url"]', {
      property: "og:url",
      content: canonical,
    });
    upsertMeta('meta[property="og:image"]', {
      property: "og:image",
      content: image,
    });

    upsertMeta('meta[property="og:image:alt"]', {
      property: "og:image:alt",
      content: imageAlt,
    });

    upsertMeta('meta[name="twitter:card"]', {
      name: "twitter:card",
      content: "summary_large_image",
    });
    upsertMeta('meta[name="twitter:title"]', {
      name: "twitter:title",
      content: twitterTitle || ogTitle || safeTitle,
    });
    upsertMeta('meta[name="twitter:description"]', {
      name: "twitter:description",
      content: twitterDescription || ogDescription || safeDescription,
    });
    upsertMeta('meta[name="twitter:image"]', {
      name: "twitter:image",
      content: image,
    });
    upsertMeta('meta[name="twitter:image:alt"]', {
      name: "twitter:image:alt",
      content: imageAlt,
    });

    if (noindex) {
      upsertMeta('meta[name="robots"]', {
        name: "robots",
        content: "noindex, nofollow",
      });
    } else {
      removeManagedRobots();
    }
  }, [
    canonicalPath,
    canonicalUrl,
    description,
    noindex,
    ogDescription,
    ogImage,
    ogImageAlt,
    ogTitle,
    title,
    twitterDescription,
    twitterTitle,
  ]);

  return null;
}

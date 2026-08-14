import { Link } from "react-router-dom";
import SEO from "../components/SEO";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-[#F5F1E9] text-[#183D35]">
      <SEO
        title="Page Not Found | Hooman Finder"
        description="The requested Hooman Finder page could not be found."
        canonicalPath="/404"
        noindex
      />
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16 text-center">
        <h1 className="font-['Fraunces',serif] text-4xl font-semibold">Page not found</h1>
        <p className="mt-4 text-[#6F6A66]">
          This page does not exist or is no longer available.
        </p>
        <Link
          to="/dogs"
          className="mt-8 inline-flex rounded-full bg-[#183D35] px-6 py-3 font-semibold text-[#F3C982]"
        >
          Browse current adoptable dogs
        </Link>
      </main>
      <SiteFooter />
    </div>
  );
}

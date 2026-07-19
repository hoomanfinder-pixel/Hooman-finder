// src/App.jsx
import React, { lazy, Suspense, useEffect, useLayoutEffect, useRef } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";

import Home from "./pages/Home.jsx";

const Quiz = lazy(() => import("./pages/Quiz.jsx"));
const Results = lazy(() => import("./pages/Results.jsx"));
const Dogs = lazy(() => import("./pages/Dogs.jsx"));
const DogDetail = lazy(() => import("./pages/DogDetail.jsx"));
const Shelter = lazy(() => import("./pages/Shelter.jsx"));
const JoinShelters = lazy(() => import("./pages/JoinShelters.jsx"));
const Saved = lazy(() => import("./pages/Saved.jsx"));
const About = lazy(() => import("./pages/About.jsx"));
const Contact = lazy(() => import("./pages/Contact.jsx"));
const Privacy = lazy(() => import("./pages/Privacy.jsx"));
const Terms = lazy(() => import("./pages/Terms.jsx"));

function ScrollToTop() {
  const location = useLocation();

  useLayoutEffect(() => {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
  }, []);

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.key]);

  return null;
}

export default function App() {
  const location = useLocation();
  const hasMounted = useRef(false);

  useEffect(() => {
    hasMounted.current = true;
  }, []);

  return (
    <>
      <ScrollToTop />
      {/* Keep the short entrance animation for in-app route changes, but do
          not hide the first paint behind it on a direct page load. */}
      <div
        key={location.pathname}
        className={hasMounted.current ? "hf-page-enter" : undefined}
      >
        <Suspense
          fallback={
            <div
              className="min-h-screen bg-[#F5F1E9]"
              role="status"
              aria-label="Loading page"
            />
          }
        >
          <Routes>
            <Route path="/" element={<Home />} />

            <Route path="/quiz" element={<Quiz />} />
            <Route path="/results" element={<Results />} />

            <Route path="/dogs" element={<Dogs />} />
            <Route path="/saved" element={<Saved />} />

            <Route path="/about" element={<About />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />

            {/* Dog profile page (support BOTH /dog/:id and /dogs/:id so nothing breaks) */}
            <Route path="/dog/:id" element={<DogDetail />} />
            <Route path="/dogs/:id" element={<DogDetail />} />

            {/* Shelter profile page */}
            <Route path="/shelter/:id" element={<Shelter />} />

            {/* Shelter onboarding / join page */}
            <Route path="/shelters/join" element={<JoinShelters />} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </div>
    </>
  );
}

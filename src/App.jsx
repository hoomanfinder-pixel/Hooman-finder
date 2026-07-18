// src/App.jsx
import React, { useLayoutEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";

import Home from "./pages/Home.jsx";
import Quiz from "./pages/Quiz.jsx";
import Results from "./pages/Results.jsx";
import Dogs from "./pages/Dogs.jsx";
import DogDetail from "./pages/DogDetail.jsx";
import Shelter from "./pages/Shelter.jsx";
import JoinShelters from "./pages/JoinShelters.jsx";
import Saved from "./pages/Saved.jsx";
import About from "./pages/About.jsx";
import Contact from "./pages/Contact.jsx";
import Privacy from "./pages/Privacy.jsx";
import Terms from "./pages/Terms.jsx";

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

  return (
    <>
      <ScrollToTop />
      {/* Keying on pathname re-triggers the CSS entrance animation on every
          route change (short fade + slight rise). Purely a class-driven
          CSS animation, so it can't delay rendering or interfere with
          ScrollToTop, and it's a no-op under prefers-reduced-motion via the
          global media query in index.css. */}
      <div key={location.pathname} className="hf-page-enter">
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
      </div>
    </>
  );
}

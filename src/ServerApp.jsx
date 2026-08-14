import { Suspense } from "react";
import { Route, Routes } from "react-router-dom";

import Home from "./pages/Home.jsx";
import Dogs from "./pages/Dogs.jsx";
import Quiz from "./pages/Quiz.jsx";
import About from "./pages/About.jsx";
import Contact from "./pages/Contact.jsx";
import Privacy from "./pages/Privacy.jsx";
import Terms from "./pages/Terms.jsx";
import JoinShelters from "./pages/JoinShelters.jsx";
import Shelter from "./pages/Shelter.jsx";
import NotFound from "./pages/NotFound.jsx";

// The browser app stays route-split. This eager server-only route table lets
// renderToString produce complete HTML instead of Suspense fallbacks.
export default function ServerApp() {
  return (
    <div>
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
          <Route path="/dogs" element={<Dogs />} />
          <Route path="/quiz" element={<Quiz />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/shelters/join" element={<JoinShelters />} />
          <Route path="/shelter/:id" element={<Shelter />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </div>
  );
}

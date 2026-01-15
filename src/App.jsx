// src/App.jsx
import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import Home from "./pages/Home.jsx";
import Quiz from "./pages/Quiz.jsx";
import Results from "./pages/Results.jsx";
import DogDetail from "./pages/DogDetail.jsx";
import Shelter from "./pages/Shelter.jsx";
import JoinShelters from "./pages/JoinShelters.jsx";
import Saved from "./pages/Saved.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/quiz" element={<Quiz />} />
      <Route path="/results" element={<Results />} />
      <Route path="/saved" element={<Saved />} />

      {/* Dog profile page */}
      <Route path="/dog/:id" element={<DogDetail />} />

      {/* Shelter profile page */}
      <Route path="/shelter/:id" element={<Shelter />} />

      {/* Shelter onboarding / join page */}
      <Route path="/shelters/join" element={<JoinShelters />} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

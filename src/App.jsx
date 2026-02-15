import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import About from "./pages/About";
import Dogs from "./pages/Dogs";
import DogDetail from "./pages/DogDetail";
import Quiz from "./pages/Quiz";
import Results from "./pages/Results";
import Saved from "./pages/Saved";
import JoinShelters from "./pages/JoinShelters";
import Contact from "./pages/Contact";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/about" element={<About />} />
      <Route path="/dogs" element={<Dogs />} />
      <Route path="/dogs/:id" element={<DogDetail />} />
      <Route path="/quiz" element={<Quiz />} />
      <Route path="/results" element={<Results />} />
      <Route path="/saved" element={<Saved />} />
      <Route path="/shelters/join" element={<JoinShelters />} />
      <Route path="/contact" element={<Contact />} />
    </Routes>
  );
}

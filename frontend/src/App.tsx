import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import Scanner from "./pages/Scanner";
import Dossier from "./pages/Dossier";
import Upload from "./pages/Upload";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/scan" element={<Scanner />} />
        <Route path="/dossier" element={<Dossier />} />
        <Route path="/upload" element={<Upload />} />
      </Route>
    </Routes>
  );
}

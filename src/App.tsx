import { DemoSection } from "./components/DemoSection";
import { HowItWorks } from "./components/HowItWorks";
import { ModalityLab } from "./components/ModalityLab";
import { PaperSection } from "./components/PaperSection";
import { ResultsSection } from "./components/ResultsSection";
import { TopBar } from "./components/TopBar";

export default function App() {
  return (
    <div className="min-h-screen text-white">
      <TopBar />
      <main>
        <DemoSection />
        <ModalityLab />
        <ResultsSection />
        <HowItWorks />
        <PaperSection />
      </main>
    </div>
  );
}

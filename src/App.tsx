import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "@/components/Layout";
import ProjectPage from "@/pages/ProjectPage";
import ProjectWorkspace from "@/pages/ProjectWorkspace";
import QAExportPage from "@/pages/QAExportPage";
import PromptsPage from "@/pages/PromptsPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<ProjectPage />} />
            <Route path="/workspace/:projectId" element={<ProjectWorkspace />} />
            <Route path="/qa-export" element={<QAExportPage />} />
            <Route path="/prompts" element={<PromptsPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

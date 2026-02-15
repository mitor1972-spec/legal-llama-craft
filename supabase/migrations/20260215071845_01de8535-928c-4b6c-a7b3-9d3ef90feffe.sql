
-- Projects
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic TEXT NOT NULL,
  notes_general TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access projects" ON public.projects FOR ALL USING (true) WITH CHECK (true);

-- Clusters
CREATE TABLE public.clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  intent TEXT NOT NULL DEFAULT 'BOFU',
  notes TEXT DEFAULT '',
  approved BOOLEAN DEFAULT false,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.clusters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access clusters" ON public.clusters FOR ALL USING (true) WITH CHECK (true);

-- Seeds
CREATE TABLE public.seeds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id UUID REFERENCES public.clusters(id) ON DELETE CASCADE NOT NULL,
  text TEXT NOT NULL,
  approved BOOLEAN DEFAULT true,
  order_index INTEGER DEFAULT 0
);
ALTER TABLE public.seeds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access seeds" ON public.seeds FOR ALL USING (true) WITH CHECK (true);

-- Title Runs
CREATE TABLE public.title_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  block_name TEXT NOT NULL DEFAULT 'B1',
  count INTEGER NOT NULL DEFAULT 200,
  cluster_ids_json JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.title_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access title_runs" ON public.title_runs FOR ALL USING (true) WITH CHECK (true);

-- Titles
CREATE TABLE public.titles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title_run_id UUID REFERENCES public.title_runs(id) ON DELETE CASCADE NOT NULL,
  text TEXT NOT NULL,
  flagged BOOLEAN DEFAULT false,
  approved BOOLEAN DEFAULT true,
  note TEXT DEFAULT ''
);
ALTER TABLE public.titles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access titles" ON public.titles FOR ALL USING (true) WITH CHECK (true);

-- QA Results
CREATE TABLE public.qa_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  target_type TEXT NOT NULL DEFAULT 'titles',
  summary_json JSONB DEFAULT '{}',
  issues_json JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.qa_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access qa_results" ON public.qa_results FOR ALL USING (true) WITH CHECK (true);

-- Prompt Versions
CREATE TABLE public.prompt_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_type TEXT NOT NULL,
  content TEXT NOT NULL,
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.prompt_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access prompt_versions" ON public.prompt_versions FOR ALL USING (true) WITH CHECK (true);

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_projects_updated_at
BEFORE UPDATE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_PROMPTS } from "./default-prompts";

// ========== PROJECTS ==========
export async function getProjects() {
  const { data, error } = await supabase.from("projects").select("*").order("updated_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function createProject(topic: string) {
  const { data, error } = await supabase.from("projects").insert({ topic }).select().single();
  if (error) throw error;
  return data;
}

export async function updateProject(id: string, updates: { topic?: string; notes_general?: string }) {
  const { error } = await supabase.from("projects").update(updates).eq("id", id);
  if (error) throw error;
}

export async function deleteProject(id: string) {
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) throw error;
}

// ========== CLUSTERS ==========
export async function getClusters(projectId: string) {
  const { data, error } = await supabase.from("clusters").select("*").eq("project_id", projectId).order("order_index");
  if (error) throw error;
  return data;
}

export async function upsertClusters(projectId: string, clusters: { name: string; intent: string; seeds: string[] }[]) {
  // Delete existing clusters for this project first
  await supabase.from("clusters").delete().eq("project_id", projectId);

  for (let i = 0; i < clusters.length; i++) {
    const c = clusters[i];
    const { data: clusterData, error: clusterError } = await supabase
      .from("clusters")
      .insert({ project_id: projectId, name: c.name, intent: c.intent, order_index: i })
      .select()
      .single();
    if (clusterError) throw clusterError;

    if (c.seeds?.length) {
      const seedRows = c.seeds.map((text, j) => ({ cluster_id: clusterData.id, text, order_index: j }));
      const { error: seedError } = await supabase.from("seeds").insert(seedRows);
      if (seedError) throw seedError;
    }
  }
}

export async function updateCluster(id: string, updates: { name?: string; intent?: string; notes?: string; approved?: boolean }) {
  const { error } = await supabase.from("clusters").update(updates).eq("id", id);
  if (error) throw error;
}

export async function deleteCluster(id: string) {
  const { error } = await supabase.from("clusters").delete().eq("id", id);
  if (error) throw error;
}

// ========== SEEDS ==========
export async function getSeeds(clusterId: string) {
  const { data, error } = await supabase.from("seeds").select("*").eq("cluster_id", clusterId).order("order_index");
  if (error) throw error;
  return data;
}

export async function updateSeed(id: string, updates: { text?: string; approved?: boolean }) {
  const { error } = await supabase.from("seeds").update(updates).eq("id", id);
  if (error) throw error;
}

export async function deleteSeed(id: string) {
  const { error } = await supabase.from("seeds").delete().eq("id", id);
  if (error) throw error;
}

export async function replaceSeeds(clusterId: string, seeds: string[]) {
  await supabase.from("seeds").delete().eq("cluster_id", clusterId);
  const rows = seeds.map((text, i) => ({ cluster_id: clusterId, text, order_index: i }));
  const { error } = await supabase.from("seeds").insert(rows);
  if (error) throw error;
}

// ========== TITLE RUNS & TITLES ==========
export async function getTitleRuns(projectId: string) {
  const { data, error } = await supabase.from("title_runs").select("*").eq("project_id", projectId).order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function createTitleRun(projectId: string, blockName: string, count: number, clusterIds: string[]) {
  const { data, error } = await supabase
    .from("title_runs")
    .insert({ project_id: projectId, block_name: blockName, count, cluster_ids_json: clusterIds })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getTitles(titleRunId: string) {
  const { data, error } = await supabase.from("titles").select("*").eq("title_run_id", titleRunId);
  if (error) throw error;
  return data;
}

export async function getAllProjectTitles(projectId: string) {
  const runs = await getTitleRuns(projectId);
  if (!runs.length) return [];
  const runIds = runs.map(r => r.id);
  const { data, error } = await supabase.from("titles").select("*").in("title_run_id", runIds);
  if (error) throw error;
  return data || [];
}

export async function saveTitles(titleRunId: string, titles: string[]) {
  const rows = titles.map(text => {
    const cleaned = text.replace(/,/g, " - ");
    return { title_run_id: titleRunId, text: cleaned };
  });
  const { error } = await supabase.from("titles").insert(rows);
  if (error) throw error;
}

export async function updateTitle(id: string, updates: { text?: string; flagged?: boolean; approved?: boolean; note?: string }) {
  const { error } = await supabase.from("titles").update(updates).eq("id", id);
  if (error) throw error;
}

// ========== QA ==========
export async function saveQAResult(projectId: string, targetType: string, summary: any, issues: any[]) {
  const { data, error } = await supabase
    .from("qa_results")
    .insert({ project_id: projectId, target_type: targetType, summary_json: summary, issues_json: issues })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getQAResults(projectId: string) {
  const { data, error } = await supabase.from("qa_results").select("*").eq("project_id", projectId).order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

// ========== PROMPTS ==========
export async function getActivePrompt(promptType: string): Promise<string> {
  const { data, error } = await supabase
    .from("prompt_versions")
    .select("*")
    .eq("prompt_type", promptType)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  if (data && data.length > 0) return data[0].content;
  return DEFAULT_PROMPTS[promptType as keyof typeof DEFAULT_PROMPTS] || "";
}

export async function getPromptVersions(promptType: string) {
  const { data, error } = await supabase
    .from("prompt_versions")
    .select("*")
    .eq("prompt_type", promptType)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function savePromptVersion(promptType: string, content: string) {
  // Deactivate all existing for this type
  await supabase.from("prompt_versions").update({ is_active: false }).eq("prompt_type", promptType);
  const { data, error } = await supabase
    .from("prompt_versions")
    .insert({ prompt_type: promptType, content, is_active: true })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function activatePromptVersion(id: string, promptType: string) {
  await supabase.from("prompt_versions").update({ is_active: false }).eq("prompt_type", promptType);
  const { error } = await supabase.from("prompt_versions").update({ is_active: true }).eq("id", id);
  if (error) throw error;
}

// ========== AI CALL ==========
export async function callAI(mode: string, systemPrompt: string, userInput: any) {
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/seo-generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ mode, system_prompt: systemPrompt, user_input: userInput }),
  });

  if (response.status === 429) throw new Error("Rate limit exceeded. Please wait and retry.");
  if (response.status === 402) throw new Error("AI credits exhausted. Add credits in Settings > Workspace > Usage.");
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || "AI request failed");
  }

  const data = await response.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}

// ========== BATCH HELPERS ==========
export async function getTitleRunsWithTitles(projectId: string) {
  const runs = await getTitleRuns(projectId);
  if (!runs.length) return [];
  const runIds = runs.map(r => r.id);
  const { data: allTitles, error } = await supabase.from("titles").select("*").in("title_run_id", runIds);
  if (error) throw error;
  return runs.map(run => ({
    ...run,
    titles: (allTitles || []).filter(t => t.title_run_id === run.id),
  }));
}

export async function deleteTitleRun(runId: string) {
  // Titles cascade via FK or we delete manually
  await supabase.from("titles").delete().eq("title_run_id", runId);
  const { error } = await supabase.from("title_runs").delete().eq("id", runId);
  if (error) throw error;
}

export async function deleteAllTitleRuns(projectId: string) {
  const runs = await getTitleRuns(projectId);
  for (const r of runs) {
    await supabase.from("titles").delete().eq("title_run_id", r.id);
  }
  await supabase.from("title_runs").delete().eq("project_id", projectId);
}

// ========== EXPORT UTILS ==========
export function sanitizeCommas(text: string): string {
  return text.replace(/,/g, " -");
}

export function exportWPAuto(items: string[]): string {
  return items.map(sanitizeCommas).join(", ");
}

export function exportNichoAI(items: string[]): string {
  return items.join("\n");
}

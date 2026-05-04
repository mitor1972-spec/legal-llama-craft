import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAppStore } from "@/lib/store";
import {
  getClusters, getSeeds, updateCluster, updateSeed, replaceSeeds, deleteCluster,
  getTitleRunsWithTitles, createTitleRun, saveTitles,
  callAI, getActivePrompt, getProjectById, buildProjectContext,
  generateClustersForProject, deleteTitleRun, deleteAllTitleRuns,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  Loader2, RefreshCw, ChevronDown, ChevronUp, Sparkles, ArrowLeft,
  Trash2, Zap, Search, Download,
} from "lucide-react";
import { toast } from "sonner";
import TitleBatchCard from "@/components/TitleBatchCard";
import { exportWPAuto, exportNichoAI } from "@/lib/api";

const BLOCKS = [
  { value: "B1", label: "B1 Comercial" },
  { value: "B2", label: "B2 Defensa/Urgente" },
  { value: "B3", label: "B3 Trámites/Proceso" },
  { value: "B4", label: "B4 Reclamaciones/Conflictos" },
  { value: "CUSTOM", label: "CUSTOM" },
];
const MIX_BLOCKS = ["B1", "B2", "B3", "B4"];
const DEFAULT_MIX_PCTS = { B1: 40, B2: 20, B3: 25, B4: 15 };

function distributeCounts(total: number, pcts: Record<string, number>): Record<string, number> {
  const entries = Object.entries(pcts);
  const raw = entries.map(([k, p]) => ({ k, n: Math.floor((total * p) / 100) }));
  let sum = raw.reduce((s, r) => s + r.n, 0);
  let i = 0;
  while (sum < total) { raw[i % raw.length].n++; sum++; i++; }
  const result: Record<string, number> = {};
  raw.forEach(r => { result[r.k] = r.n; });
  return result;
}

const CHUNK_SIZE = 50;
const MAX_RETRIES_PER_CHUNK = 6;
const MAX_EMPTY_CHUNKS_PER_BLOCK = 3;
const AVOID_LIST_WINDOW = 120;

const normalizeTitle = (value: unknown) => {
  if (typeof value !== "string") return "";
  return value.replace(/,/g, " - ").replace(/\s+/g, " ").trim();
};

export default function ProjectWorkspace() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { setCurrentProject } = useAppStore();

  const [project, setProject] = useState<any>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [clusters, setClusters] = useState<any[]>([]);
  const [seedsMap, setSeedsMap] = useState<Record<string, any[]>>({});
  const [expandedCluster, setExpandedCluster] = useState<string | null>(null);
  const [regenLoading, setRegenLoading] = useState(false);

  // Title generation state
  const [selectedClusters, setSelectedClusters] = useState<string[]>([]);
  const [block, setBlock] = useState("B1");
  const [count, setCount] = useState("2000");
  const [batches, setBatches] = useState<any[]>([]);
  const [genLoading, setGenLoading] = useState(false);
  const [replaceMode, setReplaceMode] = useState(false);
  const [genMode, setGenMode] = useState<"SINGLE" | "MIX">("MIX");
  const [mixPcts, setMixPcts] = useState<Record<string, number>>({ ...DEFAULT_MIX_PCTS });

  // Filters
  const [filterBlock, setFilterBlock] = useState("ALL");
  const [filterCluster, setFilterCluster] = useState("ALL");
  const [filterKeyword, setFilterKeyword] = useState("");

  const clusterNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    clusters.forEach(c => { map[c.id] = c.name; });
    return map;
  }, [clusters]);

  const loadAll = async () => {
    if (!projectId) return;
    try {
      setLoadError(null);
      const [p, cls, runs] = await Promise.all([
        getProjectById(projectId),
        getClusters(projectId),
        getTitleRunsWithTitles(projectId),
      ]);
      setProject(p);
      setClusters(cls || []);
      setBatches(runs || []);
      setCurrentProject(p.id, p.topic);
      setSelectedClusters((prev) => prev.length === 0 ? (cls || []).map((c: any) => c.id) : prev);
    } catch (e: any) {
      setLoadError(e.message || "Error cargando proyecto");
      toast.error(e.message);
    }
  };

  useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, [projectId]);

  const loadSeeds = async (clusterId: string) => {
    const data = await getSeeds(clusterId);
    setSeedsMap((prev) => ({ ...prev, [clusterId]: data || [] }));
  };

  const toggleExpand = (id: string) => {
    if (expandedCluster === id) { setExpandedCluster(null); return; }
    setExpandedCluster(id);
    if (!seedsMap[id]) loadSeeds(id);
  };

  const handleRegenAllClusters = async () => {
    if (!projectId || !project) return;
    setRegenLoading(true);
    try {
      const n = await generateClustersForProject(projectId, project);
      toast.success(`${n} clusters regenerados y aprobados`);
      setSeedsMap({});
      await loadAll();
      setSelectedClusters([]);
    } catch (e: any) { toast.error(e.message); }
    finally { setRegenLoading(false); }
  };

  const handleClusterNameSave = async (id: string, name: string) => {
    try {
      await updateCluster(id, { name });
      setClusters((cs) => cs.map((c) => c.id === id ? { ...c, name } : c));
    } catch (e: any) { toast.error(e.message); }
  };

  const handleDeleteCluster = async (id: string) => {
    try {
      await deleteCluster(id);
      toast.success("Cluster eliminado");
      setClusters((cs) => cs.filter((c) => c.id !== id));
      setSelectedClusters((prev) => prev.filter((x) => x !== id));
    } catch (e: any) { toast.error(e.message); }
  };

  const toggleCluster = (id: string) => {
    setSelectedClusters((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const updateMixPct = (blockKey: string, value: number) => {
    setMixPcts(prev => {
      const others = MIX_BLOCKS.filter(b => b !== blockKey);
      const remaining = 100 - value;
      const otherSum = others.reduce((s, b) => s + prev[b], 0);
      const next = { ...prev, [blockKey]: value };
      if (otherSum > 0) {
        others.forEach(b => { next[b] = Math.round((prev[b] / otherSum) * remaining); });
        const newSum = MIX_BLOCKS.reduce((s, b) => s + next[b], 0);
        if (newSum !== 100) next[others[0]] += 100 - newSum;
      }
      return next;
    });
  };

  const generateTitleChunk = async (
    blockName: string, chunkTarget: number, prompt: string,
    selectedClusterIds: string[], selectedClusterNames: string[],
    seedPack: string[], avoidList: string[],
    projectCtx: Record<string, any>, seen: Set<string>,
  ): Promise<string[]> => {
    const chunkTitles: string[] = [];
    let attempts = 0;
    while (chunkTitles.length < chunkTarget && attempts < MAX_RETRIES_PER_CHUNK) {
      const missing = chunkTarget - chunkTitles.length;
      try {
        const result = await callAI("TITLES", prompt, {
          ...projectCtx,
          count: missing,
          block_name: blockName,
          include_cluster_ids: selectedClusterIds,
          cluster_names: selectedClusterNames,
          seed_pack: seedPack,
          constraints: {
            exclude_topics: (projectCtx.exclude_topics || "").split(/[,\n;]+/).map((s: string) => s.trim()).filter(Boolean),
            year_hint: 2026,
          },
          retry_hint: attempts === 0
            ? `Bloque ${blockName}. Devuelve exactamente ${missing} títulos válidos para este bloque.`
            : `Bloque ${blockName}. Faltan ${missing} títulos. Devuelve exactamente ${missing} títulos NUEVOS y distintos.`,
          avoid_list: [...avoidList, ...chunkTitles].slice(-AVOID_LIST_WINDOW),
        });
        const generatedTitles = Array.isArray(result?.titles) ? result.titles : [];
        for (const rawTitle of generatedTitles) {
          const t = normalizeTitle(rawTitle);
          const k = t.toLowerCase();
          if (!t || seen.has(k)) continue;
          seen.add(k);
          chunkTitles.push(t);
          if (chunkTitles.length === chunkTarget) break;
        }
      } catch (err: any) {
        console.warn(`[${blockName}] chunk attempt ${attempts + 1} falló:`, err?.message);
      }
      attempts++;
    }
    return chunkTitles;
  };

  const handleGenerate = async () => {
    if (!projectId) return;
    if (selectedClusters.length === 0) return toast.error("Selecciona al menos un cluster");
    setGenLoading(true);
    try {
      const n = parseInt(count, 10);
      if (Number.isNaN(n) || n <= 0) throw new Error("Cantidad inválida");
      if (replaceMode) await deleteAllTitleRuns(projectId);

      const prompt = await getActivePrompt("GPT2");
      const projectCtx = buildProjectContext(project);
      const selectedClusterNames = clusters.filter((c) => selectedClusters.includes(c.id)).map((c) => c.name);
      const seedGroups = await Promise.all(selectedClusters.map((cId) => getSeeds(cId)));
      const seedPack = seedGroups.flatMap((seeds) => (seeds || []).map((s: any) => s.text));
      const avoidList = !replaceMode && batches.length > 0
        ? batches.flatMap((b) => b.titles || []).slice(-50).map((t: any) => t.text)
        : [];

      if (genMode === "SINGLE") {
        const seen = new Set(avoidList.map((t) => normalizeTitle(t).toLowerCase()).filter(Boolean));
        const run = await createTitleRun(projectId, block, n, selectedClusters);
        const allTitles: string[] = [];
        const workingAvoid = [...avoidList];
        let remaining = n;
        while (remaining > 0) {
          const target = Math.min(remaining, CHUNK_SIZE);
          const titles = await generateTitleChunk(block, target, prompt, selectedClusters, selectedClusterNames, seedPack, workingAvoid, projectCtx, seen);
          if (titles.length > 0) {
            await saveTitles(run.id, titles);
            allTitles.push(...titles);
            workingAvoid.push(...titles);
          }
          remaining -= target;
          if (titles.length === 0) break;
        }
        toast.success(`${allTitles.length} títulos generados (${block})`);
      } else {
        const dist = distributeCounts(n, mixPcts);
        let totalGenerated = 0;
        const failedBlocks: string[] = [];
        const globalSeen = new Set(avoidList.map((t) => normalizeTitle(t).toLowerCase()).filter(Boolean));
        const globalAvoidList = [...avoidList];
        const jobs = await Promise.all(
          MIX_BLOCKS
            .map((bk) => ({ blockName: bk, target: dist[bk] }))
            .filter((job) => job.target > 0)
            .map(async (job) => {
              const run = await createTitleRun(projectId, job.blockName, job.target, selectedClusters);
              return { ...job, runId: run.id, generated: 0, emptyChunks: 0, done: false };
            })
        );
        while (jobs.some((j) => !j.done)) {
          for (const job of jobs) {
            if (job.done) continue;
            const remaining = job.target - job.generated;
            const chunkTarget = Math.min(remaining, CHUNK_SIZE);
            toast.info(`Generando ${job.blockName}: ${job.generated}/${job.target}...`);
            try {
              const titles = await generateTitleChunk(job.blockName, chunkTarget, prompt, selectedClusters, selectedClusterNames, seedPack, globalAvoidList, projectCtx, globalSeen);
              if (titles.length > 0) {
                await saveTitles(job.runId, titles);
                job.generated += titles.length;
                totalGenerated += titles.length;
                job.emptyChunks = 0;
                globalAvoidList.push(...titles);
              } else {
                job.emptyChunks++;
              }
              if (job.generated >= job.target) job.done = true;
              if (job.emptyChunks >= MAX_EMPTY_CHUNKS_PER_BLOCK) {
                job.done = true;
                failedBlocks.push(job.blockName);
                toast.warning(`${job.blockName}: detenido (${job.generated}/${job.target})`);
              }
            } catch (err: any) {
              job.emptyChunks++;
              if (job.emptyChunks >= MAX_EMPTY_CHUNKS_PER_BLOCK) {
                job.done = true;
                failedBlocks.push(job.blockName);
                toast.error(`${job.blockName} falló: ${err?.message || "error"}.`);
              }
            }
          }
        }
        if (failedBlocks.length === 0) toast.success(`Mix completo: ${totalGenerated} títulos en 4 bloques`);
        else toast.warning(`Mix parcial: ${totalGenerated}. Bloques con problemas: ${failedBlocks.join(", ")}`);
      }
      await loadAll();
    } catch (e: any) {
      toast.error(e.message);
    } finally { setGenLoading(false); }
  };

  const handleDeleteBatch = async (runId: string) => {
    await deleteTitleRun(runId);
    toast.success("Batch eliminado");
    await loadAll();
  };

  const handleClearAll = async () => {
    if (!projectId) return;
    await deleteAllTitleRuns(projectId);
    toast.success("Todos los batches eliminados");
    await loadAll();
  };

  const filteredBatches = useMemo(() => {
    return batches.filter(b => {
      if (filterBlock !== "ALL" && b.block_name !== filterBlock) return false;
      if (filterCluster !== "ALL") {
        const ids = (b.cluster_ids_json || []) as string[];
        if (!ids.includes(filterCluster)) return false;
      }
      if (filterKeyword.trim()) {
        const kw = filterKeyword.toLowerCase();
        if (!(b.titles || []).some((t: any) => t.text.toLowerCase().includes(kw))) return false;
      }
      return true;
    });
  }, [batches, filterBlock, filterCluster, filterKeyword]);

  const totalTitles = useMemo(() => batches.reduce((s, b) => s + (b.titles?.length || 0), 0), [batches]);
  const totalN = parseInt(count) || 200;
  const dist = distributeCounts(totalN, mixPcts);

  if (!projectId) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-muted-foreground">No se encontró el proyecto.</p>
        <Button variant="outline" onClick={() => navigate("/")}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Volver a proyectos
        </Button>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        {loadError ? (
          <>
            <p className="text-destructive">{loadError}</p>
            <Button variant="outline" onClick={() => navigate("/")}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Volver a proyectos
            </Button>
          </>
        ) : (
          <>
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Cargando proyecto...</p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="mb-2 -ml-2">
            <ArrowLeft className="w-4 h-4 mr-1" /> Proyectos
          </Button>
          <h2 className="font-display text-2xl font-bold">{project.topic}</h2>
          <p className="text-muted-foreground text-sm">
            {clusters.length} clusters · {totalTitles} títulos en {batches.length} batches
          </p>
        </div>
        <Link to="/qa-export">
          <Button variant="outline" size="sm">QA + Export</Button>
        </Link>
      </div>

      {/* SECTION 1: CLUSTERS */}
      <Card>
        <CardContent className="py-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold">Clusters generados</h3>
            <Button onClick={handleRegenAllClusters} disabled={regenLoading} variant="outline" size="sm">
              {regenLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Sparkles className="w-4 h-4 mr-1" />}
              Regenerar clusters
            </Button>
          </div>

          {clusters.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No hay clusters. Pulsa "Regenerar clusters" para generarlos.
            </p>
          ) : (
            <div className="space-y-2">
              {clusters.map((c) => (
                <div key={c.id} className="border border-border rounded-md">
                  <div className="flex items-center gap-2 p-2">
                    <button onClick={() => toggleExpand(c.id)} className="text-muted-foreground hover:text-foreground p-1">
                      {expandedCluster === c.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    <Input
                      defaultValue={c.name}
                      onBlur={(e) => { if (e.target.value.trim() !== c.name) handleClusterNameSave(c.id, e.target.value.trim()); }}
                      className="text-sm h-8 flex-1 border-transparent hover:border-border focus:border-input"
                    />
                    <Badge variant={c.intent === "BOFU" ? "default" : c.intent === "MOFU" ? "secondary" : "outline"} className="text-xs">
                      {c.intent}
                    </Badge>
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteCluster(c.id)}>
                      <Trash2 className="w-3 h-3 text-destructive" />
                    </Button>
                  </div>
                  {expandedCluster === c.id && (
                    <div className="px-3 pb-3 space-y-1">
                      <h4 className="text-xs font-semibold text-muted-foreground mb-1">Seeds</h4>
                      {(seedsMap[c.id] || []).map((s: any) => (
                        <div key={s.id} className="flex items-center gap-2">
                          <Input
                            defaultValue={s.text}
                            onBlur={(e) => updateSeed(s.id, { text: e.target.value })}
                            className="text-xs h-7"
                          />
                        </div>
                      ))}
                      {(!seedsMap[c.id] || seedsMap[c.id].length === 0) && (
                        <p className="text-xs text-muted-foreground">Cargando seeds...</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* SECTION 2: TITLE GENERATION */}
      <Card>
        <CardContent className="py-4">
          <h3 className="font-display text-lg font-semibold mb-3">Generar títulos</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Modo</label>
              <Select value={genMode} onValueChange={(v) => setGenMode(v as "SINGLE" | "MIX")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SINGLE">Solo bloque</SelectItem>
                  <SelectItem value="MIX"><span className="flex items-center gap-1"><Zap className="w-3 h-3" /> Mix completo (B1+B2+B3+B4)</span></SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{genMode === "MIX" ? "Total títulos" : "Cantidad"}</label>
              <Input type="number" min={10} max={5000} value={count} onChange={(e) => setCount(e.target.value)} className="h-9" />
            </div>
          </div>

          {genMode === "SINGLE" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Bloque</label>
                <Select value={block} onValueChange={setBlock}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BLOCKS.map((b) => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={replaceMode} onCheckedChange={(v) => setReplaceMode(!!v)} />
                  <span>Reemplazar resultados actuales</span>
                </label>
              </div>
            </div>
          ) : (
            <div className="mb-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs text-muted-foreground">Reparto por bloque</label>
                <Button variant="ghost" size="sm" className="text-xs h-6" onClick={() => setMixPcts({ ...DEFAULT_MIX_PCTS })}>Reset</Button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {MIX_BLOCKS.map(bk => (
                  <div key={bk} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary" className="text-[10px] font-mono">{bk}</Badge>
                      <span className="text-xs font-medium">{mixPcts[bk]}% → {dist[bk]}</span>
                    </div>
                    <Slider min={0} max={80} step={5} value={[mixPcts[bk]]} onValueChange={([v]) => updateMixPct(bk, v)} className="w-full" />
                  </div>
                ))}
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={replaceMode} onCheckedChange={(v) => setReplaceMode(!!v)} />
                <span>Reemplazar resultados actuales</span>
              </label>
            </div>
          )}

          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-muted-foreground">Clusters a incluir</label>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <Checkbox
                checked={clusters.length > 0 && selectedClusters.length === clusters.length}
                onCheckedChange={(checked) => setSelectedClusters(checked ? clusters.map((c: any) => c.id) : [])}
              />
              <span>Seleccionar todos</span>
            </label>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
            {clusters.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer p-2 rounded-md hover:bg-muted">
                <Checkbox checked={selectedClusters.includes(c.id)} onCheckedChange={() => toggleCluster(c.id)} />
                <span className="truncate">{c.name}</span>
              </label>
            ))}
          </div>

          <Button onClick={handleGenerate} disabled={genLoading} size="lg" className="w-full">
            {genLoading
              ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Generando...</>
              : <><Zap className="w-4 h-4 mr-2" /> {genMode === "MIX" ? `Generar Mix (${totalN} títulos)` : `Generar ${totalN} títulos (${block})`}</>}
          </Button>
        </CardContent>
      </Card>

      {/* Filters + Batches */}
      {batches.length > 0 && (
        <Card>
          {/* Export ALL */}
          <CardContent className="py-3 border-b border-border">
            <div className="flex items-center gap-2 flex-wrap">
              <Download className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Exportar todos ({totalTitles} títulos)</span>
              <div className="flex-1" />
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-7"
                onClick={() => {
                  const all = batches.flatMap((b: any) => (b.titles || []).map((t: any) => t.text));
                  if (!all.length) return toast.error("No hay títulos para exportar");
                  navigator.clipboard.writeText(exportWPAuto(all));
                  toast.success(`${all.length} títulos copiados (WP Auto)`);
                }}
              >
                <Download className="w-3 h-3 mr-1" /> WP Auto (todos)
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-7"
                onClick={() => {
                  const all = batches.flatMap((b: any) => (b.titles || []).map((t: any) => t.text));
                  if (!all.length) return toast.error("No hay títulos para exportar");
                  navigator.clipboard.writeText(exportNichoAI(all));
                  toast.success(`${all.length} títulos copiados (Nicho.ai)`);
                }}
              >
                <Download className="w-3 h-3 mr-1" /> Nicho.ai (todos)
              </Button>
            </div>
          </CardContent>
          <CardContent className="py-3">
            <div className="flex items-center gap-2 mb-2">
              <Search className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Filtros</span>
              <div className="flex-1" />
              <Button variant="ghost" size="sm" onClick={handleClearAll} className="text-destructive text-xs">
                <Trash2 className="w-3 h-3 mr-1" /> Limpiar todo
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Select value={filterBlock} onValueChange={setFilterBlock}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Bloque" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos los bloques</SelectItem>
                  {BLOCKS.map((b) => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterCluster} onValueChange={setFilterCluster}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Cluster" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos los clusters</SelectItem>
                  {clusters.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input placeholder="Buscar por palabra clave..." value={filterKeyword} onChange={(e) => setFilterKeyword(e.target.value)} className="h-8 text-xs" />
            </div>
          </CardContent>
        </Card>
      )}

      {filteredBatches.length > 0 && (
        <div className="space-y-3">
          {filteredBatches.map((batch) => (
            <TitleBatchCard key={batch.id} run={batch} clusterNames={clusterNameMap} onDelete={handleDeleteBatch} onTitlesChanged={loadAll} />
          ))}
        </div>
      )}
    </div>
  );
}
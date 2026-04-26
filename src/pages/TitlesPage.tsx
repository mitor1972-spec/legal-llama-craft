import { useState, useEffect, useMemo } from "react";
import { useAppStore } from "@/lib/store";
import {
  getClusters, getTitleRunsWithTitles, createTitleRun, saveTitles,
  callAI, getActivePrompt, getSeeds, saveQAResult, deleteTitleRun, deleteAllTitleRuns,
  getProjectById, buildProjectContext
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Loader2, RefreshCw, ShieldCheck, Trash2, Search, Zap } from "lucide-react";
import { toast } from "sonner";
import TitleBatchCard from "@/components/TitleBatchCard";

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

export default function TitlesPage() {
  const { currentProjectId, currentProjectTopic } = useAppStore();
  const [clusters, setClusters] = useState<any[]>([]);
  const [selectedClusters, setSelectedClusters] = useState<string[]>([]);
  const [block, setBlock] = useState("B1");
  const [count, setCount] = useState("200");
  const [batches, setBatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [qaLoading, setQaLoading] = useState(false);
  const [replaceMode, setReplaceMode] = useState(false);

  // Mix mode
  const [genMode, setGenMode] = useState<"SINGLE" | "MIX">("SINGLE");
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

  const loadData = async () => {
    if (!currentProjectId) return;
    const [cls, runs] = await Promise.all([
      getClusters(currentProjectId),
      getTitleRunsWithTitles(currentProjectId),
    ]);
    setClusters(cls);
    setBatches(runs);
  };

  useEffect(() => { loadData(); }, [currentProjectId]);

  const toggleCluster = (id: string) => {
    setSelectedClusters((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const updateMixPct = (blockKey: string, value: number) => {
    setMixPcts(prev => {
      const others = MIX_BLOCKS.filter(b => b !== blockKey);
      const remaining = 100 - value;
      const otherSum = others.reduce((s, b) => s + prev[b], 0);
      const next = { ...prev, [blockKey]: value };
      if (otherSum > 0) {
        others.forEach(b => {
          next[b] = Math.round((prev[b] / otherSum) * remaining);
        });
        // fix rounding
        const newSum = MIX_BLOCKS.reduce((s, b) => s + next[b], 0);
        if (newSum !== 100) next[others[0]] += 100 - newSum;
      }
      return next;
    });
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
        const hasMatch = (b.titles || []).some((t: any) => t.text.toLowerCase().includes(kw));
        if (!hasMatch) return false;
      }
      return true;
    });
  }, [batches, filterBlock, filterCluster, filterKeyword]);

  const totalTitles = useMemo(() => batches.reduce((sum, b) => sum + (b.titles?.length || 0), 0), [batches]);
  const filteredTitles = useMemo(() => filteredBatches.reduce((sum, b) => sum + (b.titles?.length || 0), 0), [filteredBatches]);

  // Split large counts into chunks to avoid token overruns
  const CHUNK_SIZE = 50;
  const MAX_RETRIES_PER_CHUNK = 4;
  const AVOID_LIST_WINDOW = 120;

  const normalizeTitle = (value: unknown) => {
    if (typeof value !== "string") return "";
    return value.replace(/,/g, " - ").replace(/\s+/g, " ").trim();
  };

  const generateForBlock = async (
    blockName: string,
    n: number,
    prompt: string,
    selectedClusterNames: string[],
    seedPack: string[],
    avoidList: string[]
  ): Promise<string[]> => {
    const chunks: number[] = [];
    let remaining = n;
    while (remaining > 0) {
      chunks.push(Math.min(remaining, CHUNK_SIZE));
      remaining -= CHUNK_SIZE;
    }

    const allTitles: string[] = [];
    const seen = new Set(
      avoidList
        .map((title) => normalizeTitle(title).toLowerCase())
        .filter(Boolean)
    );

    for (const chunkTarget of chunks) {
      const chunkTitles: string[] = [];
      let attempts = 0;

      while (chunkTitles.length < chunkTarget && attempts < MAX_RETRIES_PER_CHUNK) {
        const missing = chunkTarget - chunkTitles.length;
        const result = await callAI("TITLES", prompt, {
          topic: currentProjectTopic,
          count: missing,
          block_name: blockName,
          include_cluster_ids: selectedClusters,
          cluster_names: selectedClusterNames,
          seed_pack: seedPack,
          constraints: { exclude_topics: [], year_hint: 2026 },
          retry_hint:
            attempts === 0
              ? `Devuelve exactamente ${missing} títulos válidos.`
              : `Faltan ${missing} títulos. Devuelve exactamente ${missing} títulos NUEVOS y distintos.`,
          avoid_list: [...avoidList, ...allTitles, ...chunkTitles].slice(-AVOID_LIST_WINDOW),
        });

        const generatedTitles = Array.isArray(result?.titles) ? result.titles : [];
        for (const rawTitle of generatedTitles) {
          const normalizedTitle = normalizeTitle(rawTitle);
          const normalizedKey = normalizedTitle.toLowerCase();
          if (!normalizedTitle || seen.has(normalizedKey)) continue;
          seen.add(normalizedKey);
          chunkTitles.push(normalizedTitle);
          if (chunkTitles.length === chunkTarget) break;
        }

        attempts++;
      }

      if (chunkTitles.length < chunkTarget) {
        throw new Error(`La IA no devolvió los ${chunkTarget} títulos solicitados para ${blockName}.`);
      }

      allTitles.push(...chunkTitles);
    }

    return allTitles;
  };

  const handleGenerate = async () => {
    if (!currentProjectId) return toast.error("Selecciona un proyecto");
    if (selectedClusters.length === 0) return toast.error("Selecciona al menos un cluster");
    setLoading(true);
    try {
      const n = parseInt(count, 10);
      if (Number.isNaN(n) || n <= 0) throw new Error("Introduce una cantidad válida de títulos");

      if (replaceMode) {
        await deleteAllTitleRuns(currentProjectId);
      }

      const prompt = await getActivePrompt("GPT2");
      const selectedClusterNames = clusters.filter((c) => selectedClusters.includes(c.id)).map((c) => c.name);

      const seedGroups = await Promise.all(selectedClusters.map((cId) => getSeeds(cId)));
      const seedPack = seedGroups.flatMap((seeds) => (seeds || []).map((s: any) => s.text));

      const avoidList = !replaceMode && batches.length > 0
        ? batches.flatMap((b) => b.titles || []).slice(-50).map((t: any) => t.text)
        : [];

      if (genMode === "SINGLE") {
        const titles = await generateForBlock(block, n, prompt, selectedClusterNames, seedPack, avoidList);
        const run = await createTitleRun(currentProjectId, block, n, selectedClusters);
        await saveTitles(run.id, titles);
        toast.success(`${n} títulos generados (${block})`);
      } else {
        const dist = distributeCounts(n, mixPcts);
        let totalGenerated = 0;

        for (const bk of MIX_BLOCKS) {
          const bkCount = dist[bk];
          if (bkCount <= 0) continue;
          toast.info(`Generando ${bkCount} títulos para ${bk}...`);
          const titles = await generateForBlock(bk, bkCount, prompt, selectedClusterNames, seedPack, avoidList);
          const run = await createTitleRun(currentProjectId, bk, bkCount, selectedClusters);
          await saveTitles(run.id, titles);
          totalGenerated += titles.length;
          titles.forEach((t: string) => avoidList.push(t));
        }

        toast.success(`Mix completo: ${totalGenerated} títulos generados en 4 bloques`);
      }

      await loadData();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteBatch = async (runId: string) => {
    await deleteTitleRun(runId);
    toast.success("Batch eliminado");
    await loadData();
  };

  const handleClearAll = async () => {
    if (!currentProjectId) return;
    await deleteAllTitleRuns(currentProjectId);
    toast.success("Todos los batches eliminados");
    await loadData();
  };

  const handleQA = async () => {
    if (!currentProjectId) return;
    setQaLoading(true);
    try {
      const allTitles = batches.flatMap(b => b.titles || []);
      const items = allTitles.map((t: any) => t.text);
      const prompt = await getActivePrompt("QA");
      const result = await callAI("QA", prompt, { item_type: "titles", items, rules: { no_commas_in_titles: true } });
      if (result?.summary) {
        await saveQAResult(currentProjectId, "titles", result.summary, result.issues || []);
        toast.success(`QA: ${result.issues?.length || 0} issues`);
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setQaLoading(false);
    }
  };

  if (!currentProjectId) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Selecciona un proyecto en la pestaña "Proyecto"</p>
      </div>
    );
  }

  const totalN = parseInt(count) || 200;
  const dist = distributeCounts(totalN, mixPcts);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold mb-1">Títulos (GPT2)</h2>
          <p className="text-muted-foreground text-sm">
            Temática: {currentProjectTopic} · {totalTitles} títulos en {batches.length} batches
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleQA} disabled={qaLoading || totalTitles === 0}>
            {qaLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <ShieldCheck className="w-4 h-4 mr-1" />}
            QA Títulos
          </Button>
          <Button variant="outline" size="sm" onClick={handleClearAll} disabled={batches.length === 0} className="text-destructive">
            <Trash2 className="w-4 h-4 mr-1" />
            Limpiar todo
          </Button>
        </div>
      </div>

      {/* Generation config */}
      <Card>
        <CardContent className="py-4">
          {/* Mode selector */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Modo generación</label>
              <Select value={genMode} onValueChange={(v) => setGenMode(v as "SINGLE" | "MIX")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SINGLE">Solo bloque</SelectItem>
                  <SelectItem value="MIX">
                    <span className="flex items-center gap-1"><Zap className="w-3 h-3" /> Mix completo (B1+B2+B3+B4)</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                {genMode === "MIX" ? "Total títulos" : "Cantidad"}
              </label>
              <Input
                type="number"
                min={10}
                max={5000}
                value={count}
                onChange={(e) => setCount(e.target.value)}
                placeholder="Ej: 200"
                className="h-9"
              />
              <span className="text-[10px] text-muted-foreground">Sugeridos: 100, 200, 500, 1000, 3000</span>
            </div>
          </div>

          {/* Single block selector or Mix distribution */}
          {genMode === "SINGLE" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Bloque</label>
                <Select value={block} onValueChange={setBlock}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BLOCKS.map((b) => (
                      <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
                    ))}
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
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-6"
                  onClick={() => setMixPcts({ ...DEFAULT_MIX_PCTS })}
                >
                  Reset
                </Button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {MIX_BLOCKS.map(bk => (
                  <div key={bk} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary" className="text-[10px] font-mono">{bk}</Badge>
                      <span className="text-xs font-medium">{mixPcts[bk]}% → {dist[bk]}</span>
                    </div>
                    <Slider
                      min={0}
                      max={80}
                      step={5}
                      value={[mixPcts[bk]]}
                      onValueChange={([v]) => updateMixPct(bk, v)}
                      className="w-full"
                    />
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={replaceMode} onCheckedChange={(v) => setReplaceMode(!!v)} />
                  <span>Reemplazar resultados actuales</span>
                </label>
                <span className="text-xs text-muted-foreground">
                  Total: {MIX_BLOCKS.reduce((s, b) => s + dist[b], 0)} títulos
                </span>
              </div>
            </div>
          )}

          {/* Cluster selection */}
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-muted-foreground">Clusters a incluir</label>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <Checkbox
                checked={clusters.length > 0 && selectedClusters.length === clusters.length}
                onCheckedChange={(checked) => {
                  setSelectedClusters(checked ? clusters.map((c: any) => c.id) : []);
                }}
              />
              <span>Seleccionar todos</span>
            </label>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
            {clusters.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer p-2 rounded-md hover:bg-muted">
                <Checkbox
                  checked={selectedClusters.includes(c.id)}
                  onCheckedChange={() => toggleCluster(c.id)}
                />
                <span className="truncate">{c.name}</span>
              </label>
            ))}
          </div>

          <div className="flex gap-2">
            <Button onClick={handleGenerate} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : genMode === "MIX" ? <Zap className="w-4 h-4 mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
              {loading
                ? "Generando..."
                : genMode === "MIX"
                  ? `Mix completo (${totalN} títulos)`
                  : replaceMode
                    ? "Generar (reemplazar)"
                    : "Generar Títulos"
              }
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      {batches.length > 0 && (
        <Card>
          <CardContent className="py-3">
            <div className="flex items-center gap-2 mb-2">
              <Search className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Filtros</span>
              {(filterBlock !== "ALL" || filterCluster !== "ALL" || filterKeyword) && (
                <Badge variant="secondary" className="text-[10px]">{filteredTitles} títulos</Badge>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Select value={filterBlock} onValueChange={setFilterBlock}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Bloque" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos los bloques</SelectItem>
                  {BLOCKS.map((b) => (
                    <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterCluster} onValueChange={setFilterCluster}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Cluster" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos los clusters</SelectItem>
                  {clusters.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="Buscar por palabra clave..."
                value={filterKeyword}
                onChange={(e) => setFilterKeyword(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Batch list */}
      {filteredBatches.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-display text-lg font-semibold">
            {filteredBatches.length} batch{filteredBatches.length !== 1 ? "es" : ""}
          </h3>
          {filteredBatches.map((batch) => (
            <TitleBatchCard
              key={batch.id}
              run={batch}
              clusterNames={clusterNameMap}
              onDelete={handleDeleteBatch}
              onTitlesChanged={loadData}
            />
          ))}
        </div>
      )}

      {batches.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No hay títulos generados. Configura los parámetros y genera tu primer batch.
        </div>
      )}
    </div>
  );
}

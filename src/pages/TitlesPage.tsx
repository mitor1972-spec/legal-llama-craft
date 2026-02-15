import { useState, useEffect } from "react";
import { useAppStore } from "@/lib/store";
import {
  getClusters, getAllProjectTitles, createTitleRun, saveTitles,
  updateTitle, callAI, getActivePrompt, getSeeds, saveQAResult
} from "@/lib/api";
import { sanitizeCommas } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, RefreshCw, ShieldCheck, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const BLOCKS = [
  { value: "B1", label: "B1 Comercial" },
  { value: "B2", label: "B2 Defensa/Urgente" },
  { value: "B3", label: "B3 Trámites/Proceso" },
  { value: "B4", label: "B4 Reclamaciones/Conflictos" },
  { value: "CUSTOM", label: "CUSTOM" },
];

export default function TitlesPage() {
  const { currentProjectId, currentProjectTopic } = useAppStore();
  const [clusters, setClusters] = useState<any[]>([]);
  const [selectedClusters, setSelectedClusters] = useState<string[]>([]);
  const [block, setBlock] = useState("B1");
  const [count, setCount] = useState("200");
  const [titles, setTitles] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [qaLoading, setQaLoading] = useState(false);

  useEffect(() => {
    if (!currentProjectId) return;
    getClusters(currentProjectId).then(setClusters);
    getAllProjectTitles(currentProjectId).then(setTitles);
  }, [currentProjectId]);

  const toggleCluster = (id: string) => {
    setSelectedClusters((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleGenerate = async (isMore = false) => {
    if (!currentProjectId) return toast.error("Selecciona un proyecto");
    if (selectedClusters.length === 0) return toast.error("Selecciona al menos un cluster");
    setLoading(true);
    try {
      const prompt = await getActivePrompt("GPT2");
      const n = parseInt(count);
      const selectedClusterNames = clusters.filter(c => selectedClusters.includes(c.id)).map(c => c.name);

      // Get seeds for selected clusters
      const seedPack: string[] = [];
      for (const cId of selectedClusters) {
        const seeds = await getSeeds(cId);
        seeds.forEach((s: any) => seedPack.push(s.text));
      }

      const avoidList = isMore ? titles.slice(-50).map(t => t.text) : [];

      const result = await callAI("TITLES", prompt, {
        topic: currentProjectTopic,
        count: n,
        block_name: block,
        include_cluster_ids: selectedClusters,
        cluster_names: selectedClusterNames,
        seed_pack: seedPack,
        constraints: { exclude_topics: [], year_hint: 2026 },
        avoid_list: avoidList,
      });

      if (result?.titles?.length) {
        const run = await createTitleRun(currentProjectId, block, n, selectedClusters);
        await saveTitles(run.id, result.titles);
        toast.success(`${result.titles.length} títulos generados`);
        const allTitles = await getAllProjectTitles(currentProjectId);
        setTitles(allTitles);
      } else {
        toast.error("Respuesta inesperada de la IA");
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleQA = async () => {
    if (!currentProjectId) return;
    setQaLoading(true);
    try {
      const items = titles.map(t => t.text);
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

  const fixCommas = () => {
    let fixed = 0;
    titles.forEach((t) => {
      if (t.text.includes(",")) {
        const newText = sanitizeCommas(t.text);
        updateTitle(t.id, { text: newText });
        t.text = newText;
        fixed++;
      }
    });
    if (fixed > 0) {
      setTitles([...titles]);
      toast.success(`${fixed} títulos corregidos`);
    } else {
      toast.info("No hay comas que corregir");
    }
  };

  if (!currentProjectId) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Selecciona un proyecto en la pestaña "Proyecto"</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold mb-1">Títulos (GPT2)</h2>
          <p className="text-muted-foreground text-sm">Temática: {currentProjectTopic}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fixCommas}>
            <AlertTriangle className="w-4 h-4 mr-1" />
            Fix comas
          </Button>
          <Button variant="outline" size="sm" onClick={handleQA} disabled={qaLoading || titles.length === 0}>
            {qaLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <ShieldCheck className="w-4 h-4 mr-1" />}
            QA Títulos
          </Button>
        </div>
      </div>

      {/* Config */}
      <Card>
        <CardContent className="py-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
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
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Cantidad</label>
              <Input
                type="number"
                min={10}
                max={500}
                value={count}
                onChange={(e) => setCount(e.target.value)}
                placeholder="Ej: 200"
                className="h-9"
              />
              <span className="text-[10px] text-muted-foreground">Sugeridos: 100, 200, 300</span>
            </div>
          </div>

          {/* Cluster selection */}
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-muted-foreground">Clusters a incluir</label>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <Checkbox
                checked={clusters.length > 0 && selectedClusters.length === clusters.length}
                onCheckedChange={(checked) => {
                  if (checked) {
                    setSelectedClusters(clusters.map((c: any) => c.id));
                  } else {
                    setSelectedClusters([]);
                  }
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
            <Button onClick={() => handleGenerate(false)} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
              Generar Títulos
            </Button>
            <Button variant="outline" onClick={() => handleGenerate(true)} disabled={loading || titles.length === 0}>
              Generar {count} más
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Titles list */}
      {titles.length > 0 && (
        <div>
          <h3 className="font-display text-lg font-semibold mb-3">{titles.length} títulos</h3>
          <div className="space-y-1 max-h-[60vh] overflow-y-auto">
            {titles.map((t, i) => {
              const hasComma = t.text.includes(",");
              return (
                <div key={t.id} className={`flex items-center gap-2 py-1 px-2 rounded text-sm ${hasComma ? "bg-destructive/10 border border-destructive/30" : "hover:bg-muted"}`}>
                  <span className="text-xs text-muted-foreground w-8 text-right">{i + 1}</span>
                  <Input
                    defaultValue={t.text}
                    onBlur={(e) => updateTitle(t.id, { text: e.target.value })}
                    className={`h-7 text-xs flex-1 ${hasComma ? "border-destructive/50" : ""}`}
                  />
                  {hasComma && <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0" />}
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`text-xs h-6 px-2 ${t.flagged ? "text-warning" : "text-muted-foreground"}`}
                    onClick={() => { updateTitle(t.id, { flagged: !t.flagged }); t.flagged = !t.flagged; setTitles([...titles]); }}
                  >
                    {t.flagged ? "⚠️" : "flag"}
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

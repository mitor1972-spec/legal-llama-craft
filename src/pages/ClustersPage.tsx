import { useState, useEffect } from "react";
import { useAppStore } from "@/lib/store";
import { getClusters, getSeeds, updateCluster, updateSeed, replaceSeeds, upsertClusters, callAI, getActivePrompt, saveQAResult, getProjectById, buildProjectContext } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Loader2, RefreshCw, ChevronDown, ChevronUp, ShieldCheck, Eye } from "lucide-react";
import { toast } from "sonner";

export default function ClustersPage() {
  const { currentProjectId, currentProjectTopic } = useAppStore();
  const [clusters, setClusters] = useState<any[]>([]);
  const [seedsMap, setSeedsMap] = useState<Record<string, any[]>>({});
  const [expandedCluster, setExpandedCluster] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [regenId, setRegenId] = useState<string | null>(null);
  const [qaLoading, setQaLoading] = useState(false);

  const loadProjectContext = async () => {
    if (!currentProjectId) return { topic: currentProjectTopic };
    const p = await getProjectById(currentProjectId);
    return buildProjectContext(p);
  };

  const loadClusters = async () => {
    if (!currentProjectId) return;
    const data = await getClusters(currentProjectId);
    setClusters(data || []);
  };

  useEffect(() => { loadClusters(); }, [currentProjectId]);

  const loadSeeds = async (clusterId: string) => {
    const data = await getSeeds(clusterId);
    setSeedsMap((prev) => ({ ...prev, [clusterId]: data || [] }));
  };

  const toggleExpand = (id: string) => {
    if (expandedCluster === id) {
      setExpandedCluster(null);
    } else {
      setExpandedCluster(id);
      if (!seedsMap[id]) loadSeeds(id);
    }
  };

  const handleGenerate = async () => {
    if (!currentProjectId) return toast.error("Selecciona un proyecto primero");
    setLoading(true);
    try {
      const prompt = await getActivePrompt("GPT1");
      const ctx = await loadProjectContext();
      const result = await callAI("CLUSTERS", prompt, { ...ctx, notes: "" });
      if (result?.clusters) {
        await upsertClusters(currentProjectId, result.clusters);
        toast.success(`${result.clusters.length} clusters generados`);
        await loadClusters();
        setSeedsMap({});
      } else {
        toast.error("Respuesta inesperada de la IA");
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegenCluster = async (cluster: any) => {
    if (!currentProjectId) return;
    setRegenId(cluster.id);
    try {
      const prompt = await getActivePrompt("GPT1");
      const ctx = await loadProjectContext();
      const result = await callAI("CLUSTERS", prompt, {
        ...ctx,
        notes: `Regenera SOLO el cluster "${cluster.name}" con intención ${cluster.intent}. Devuelve el mismo formato JSON con un solo cluster.`,
      });
      if (result?.clusters?.[0]) {
        const c = result.clusters[0];
        await updateCluster(cluster.id, { name: c.name, intent: c.intent });
        await replaceSeeds(cluster.id, c.seeds || []);
        toast.success("Cluster regenerado");
        loadClusters();
        loadSeeds(cluster.id);
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setRegenId(null);
    }
  };

  const handleQASeeds = async () => {
    if (!currentProjectId) return;
    setQaLoading(true);
    try {
      const allSeeds: string[] = [];
      for (const c of clusters) {
        const seeds = seedsMap[c.id] || await getSeeds(c.id);
        seeds.forEach((s: any) => allSeeds.push(s.text));
      }
      const prompt = await getActivePrompt("QA");
      const result = await callAI("QA", prompt, { item_type: "seeds", items: allSeeds, rules: { no_commas_in_titles: false } });
      if (result?.summary) {
        await saveQAResult(currentProjectId, "seeds", result.summary, result.issues || []);
        toast.success(`QA: ${result.issues?.length || 0} issues encontrados`);
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setQaLoading(false);
    }
  };

  const handleSeedUpdate = async (seedId: string, text: string, clusterId: string) => {
    await updateSeed(seedId, { text });
    loadSeeds(clusterId);
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
          <h2 className="font-display text-2xl font-bold mb-1">Clusters (GPT1)</h2>
          <p className="text-muted-foreground text-sm">Temática: {currentProjectTopic}</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleQASeeds} disabled={qaLoading || clusters.length === 0} variant="outline">
            {qaLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <ShieldCheck className="w-4 h-4 mr-1" />}
            QA Seeds
          </Button>
          <Button onClick={handleGenerate} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
            Generar Clusters
          </Button>
        </div>
      </div>

      {clusters.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No hay clusters. Pulsa "Generar Clusters" para empezar.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {clusters.map((c) => (
            <Card key={c.id} className={`transition-colors ${c.approved ? "border-success/30" : ""}`}>
              <CardContent className="py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button onClick={() => toggleExpand(c.id)} className="text-muted-foreground hover:text-foreground">
                      {expandedCluster === c.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    <span className="font-medium text-sm">{c.name}</span>
                    <Badge variant={c.intent === "BOFU" ? "default" : c.intent === "MOFU" ? "secondary" : "outline"} className="text-xs">
                      {c.intent}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Aprobado</span>
                      <Switch
                        checked={c.approved}
                        onCheckedChange={(v) => { updateCluster(c.id, { approved: v }); loadClusters(); }}
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRegenCluster(c)}
                      disabled={regenId === c.id}
                    >
                      {regenId === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                    </Button>
                  </div>
                </div>

                {/* Notes */}
                {expandedCluster === c.id && (
                  <div className="mt-3 space-y-3">
                    <Textarea
                      placeholder="Notas del cluster..."
                      defaultValue={c.notes || ""}
                      onBlur={(e) => updateCluster(c.id, { notes: e.target.value })}
                      className="text-sm"
                      rows={2}
                    />

                    {/* Seeds */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-semibold text-muted-foreground">Seeds</h4>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRegenCluster(c)}
                          disabled={regenId === c.id}
                        >
                          <RefreshCw className="w-3 h-3 mr-1" />
                          Rehacer seeds
                        </Button>
                      </div>
                      <div className="space-y-1">
                        {(seedsMap[c.id] || []).map((s: any) => (
                          <div key={s.id} className="flex items-center gap-2">
                            <Switch
                              checked={s.approved}
                              onCheckedChange={(v) => { updateSeed(s.id, { approved: v }); loadSeeds(c.id); }}
                              className="scale-75"
                            />
                            <Input
                              defaultValue={s.text}
                              onBlur={(e) => handleSeedUpdate(s.id, e.target.value, c.id)}
                              className="text-xs h-7"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

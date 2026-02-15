import { useState, useEffect } from "react";
import { useAppStore } from "@/lib/store";
import { getQAResults, getAllProjectTitles, exportWPAuto, exportNichoAI, sanitizeCommas, updateTitle } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Copy, Download, AlertTriangle, CheckCircle } from "lucide-react";
import { toast } from "sonner";

export default function QAExportPage() {
  const { currentProjectId } = useAppStore();
  const [qaResults, setQaResults] = useState<any[]>([]);
  const [titles, setTitles] = useState<any[]>([]);
  const [exportText, setExportText] = useState("");

  useEffect(() => {
    if (!currentProjectId) return;
    getQAResults(currentProjectId).then(setQaResults);
    getAllProjectTitles(currentProjectId).then(setTitles);
  }, [currentProjectId]);

  const latestQA = qaResults[0];

  const handleFixCommas = async () => {
    let fixed = 0;
    for (const t of titles) {
      if (t.text.includes(",")) {
        const newText = sanitizeCommas(t.text);
        await updateTitle(t.id, { text: newText });
        t.text = newText;
        fixed++;
      }
    }
    setTitles([...titles]);
    toast.success(`${fixed} títulos corregidos`);
  };

  const handleExportWP = () => {
    const approved = titles.filter(t => t.approved);
    const items = (approved.length > 0 ? approved : titles).map(t => t.text);
    const text = exportWPAuto(items);
    setExportText(text);
  };

  const handleExportNicho = () => {
    const approved = titles.filter(t => t.approved);
    const items = (approved.length > 0 ? approved : titles).map(t => t.text);
    const text = exportNichoAI(items);
    setExportText(text);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(exportText);
    toast.success("Copiado al portapapeles");
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
      <h2 className="font-display text-2xl font-bold">QA + Export</h2>

      <Tabs defaultValue="qa">
        <TabsList>
          <TabsTrigger value="qa">QA</TabsTrigger>
          <TabsTrigger value="export">Export</TabsTrigger>
        </TabsList>

        <TabsContent value="qa" className="space-y-4">
          {latestQA ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Resumen QA ({latestQA.target_type})</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                    {Object.entries(latestQA.summary_json || {}).map(([key, val]) => (
                      <div key={key} className="text-center">
                        <p className="text-2xl font-display font-bold">{val as number}</p>
                        <p className="text-xs text-muted-foreground">{key.replace(/_/g, " ")}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <div className="flex gap-2 mb-2">
                <Button variant="outline" size="sm" onClick={handleFixCommas}>
                  <AlertTriangle className="w-4 h-4 mr-1" />
                  Auto-corregir comas
                </Button>
              </div>

              <div className="space-y-1 max-h-[50vh] overflow-y-auto">
                {(latestQA.issues_json || []).map((issue: any, i: number) => (
                  <Card key={i} className="border-warning/20">
                    <CardContent className="py-2">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-warning mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-sm">{issue.text}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-xs">{issue.reason}</Badge>
                            <span className="text-xs text-muted-foreground">{issue.suggestion}</span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No hay resultados QA. Ejecuta QA desde Clusters o Títulos.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="export" className="space-y-4">
          <div className="flex gap-2">
            <Button onClick={handleExportWP}>
              <Download className="w-4 h-4 mr-1" />
              Export WP Auto
            </Button>
            <Button onClick={handleExportNicho} variant="outline">
              <Download className="w-4 h-4 mr-1" />
              Export Nicho.ai
            </Button>
          </div>

          {exportText && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Preview del export</p>
                <Button variant="ghost" size="sm" onClick={copyToClipboard}>
                  <Copy className="w-4 h-4 mr-1" />
                  Copiar
                </Button>
              </div>
              <Textarea
                value={exportText}
                readOnly
                rows={12}
                className="font-mono text-xs"
              />
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

import { useState, useEffect } from "react";
import { getPromptVersions, savePromptVersion, activatePromptVersion, getActivePrompt } from "@/lib/api";
import { DEFAULT_PROMPTS } from "@/lib/default-prompts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Save, RotateCcw, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

const PROMPT_TYPES = ["GPT1", "GPT2", "QA", "EXPORT"] as const;
type PromptType = typeof PROMPT_TYPES[number];

export default function PromptsPage() {
  const [activeTab, setActiveTab] = useState<PromptType>("GPT1");
  const [content, setContent] = useState("");
  const [versions, setVersions] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  const loadData = async (type: PromptType) => {
    const activeContent = await getActivePrompt(type);
    setContent(activeContent);
    const vers = await getPromptVersions(type);
    setVersions(vers);
  };

  useEffect(() => { loadData(activeTab); }, [activeTab]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await savePromptVersion(activeTab, content);
      toast.success("Prompt guardado");
      loadData(activeTab);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRestore = () => {
    setContent(DEFAULT_PROMPTS[activeTab] || "");
    toast.info("Restaurado a valor por defecto. Pulsa Guardar para aplicar.");
  };

  const handleActivate = async (versionId: string) => {
    try {
      await activatePromptVersion(versionId, activeTab);
      toast.success("Versión activada");
      loadData(activeTab);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold mb-1">Prompts (Configuración)</h2>
        <p className="text-muted-foreground text-sm">Edita los prompts del sistema para cada modo de generación.</p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as PromptType)}>
        <TabsList>
          {PROMPT_TYPES.map((t) => (
            <TabsTrigger key={t} value={t}>{t}</TabsTrigger>
          ))}
        </TabsList>

        {PROMPT_TYPES.map((type) => (
          <TabsContent key={type} value={type} className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  <span>Prompt {type}</span>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={handleRestore}>
                      <RotateCcw className="w-4 h-4 mr-1" />
                      Default
                    </Button>
                    <Button size="sm" onClick={handleSave} disabled={saving}>
                      {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
                      Guardar
                    </Button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={16}
                  className="font-mono text-xs"
                />
              </CardContent>
            </Card>

            {/* Versions */}
            {versions.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Versiones ({versions.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {versions.map((v) => (
                      <div key={v.id} className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/50">
                        <div className="flex items-center gap-2">
                          {v.is_active && <Badge className="text-xs bg-success text-success-foreground">Activa</Badge>}
                          <span className="text-xs text-muted-foreground">
                            {new Date(v.created_at).toLocaleString("es-ES")}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs"
                            onClick={() => { setContent(v.content); toast.info("Contenido cargado en editor"); }}
                          >
                            Ver
                          </Button>
                          {!v.is_active && (
                            <Button variant="outline" size="sm" className="text-xs" onClick={() => handleActivate(v.id)}>
                              <Check className="w-3 h-3 mr-1" />
                              Usar
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

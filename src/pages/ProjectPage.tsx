import { useState, useEffect } from "react";
import { useAppStore } from "@/lib/store";
import { getProjects, createProject, deleteProject, generateClustersForProject } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, FolderOpen, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function ProjectPage() {
  const { currentProjectId, currentProjectTopic, setCurrentProject } = useAppStore();
  const [topic, setTopic] = useState("");
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const loadProjects = async () => {
    try {
      const data = await getProjects();
      setProjects(data || []);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  useEffect(() => { loadProjects(); }, []);

  const handleCreate = async () => {
    if (!topic.trim()) return toast.error("Introduce una temática");
    setLoading(true);
    try {
      const p = await createProject(topic.trim());
      setCurrentProject(p.id, p.topic);
      setTopic("");
      toast.success("Proyecto creado");
      loadProjects();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteProject(id);
      if (currentProjectId === id) setCurrentProject(null, "");
      toast.success("Proyecto eliminado");
      loadProjects();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold mb-1">Proyecto</h2>
        <p className="text-muted-foreground text-sm">Crea o selecciona un proyecto para empezar a generar clusters y títulos SEO.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nuevo proyecto</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Input
              placeholder="Ej: Derecho laboral despidos"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              className="flex-1"
            />
            <Button onClick={handleCreate} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
              Crear
            </Button>
          </div>
        </CardContent>
      </Card>

      {currentProjectId && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="py-4">
            <div className="flex items-center gap-2 text-primary">
              <FolderOpen className="w-4 h-4" />
              <span className="font-display text-sm font-semibold">Proyecto activo:</span>
              <span className="text-foreground">{currentProjectTopic}</span>
            </div>
          </CardContent>
        </Card>
      )}

      <div>
        <h3 className="font-display text-lg font-semibold mb-3">Proyectos recientes</h3>
        {projects.length === 0 ? (
          <p className="text-muted-foreground text-sm">No hay proyectos aún.</p>
        ) : (
          <div className="space-y-2">
            {projects.map((p) => (
              <Card key={p.id} className={`transition-colors ${currentProjectId === p.id ? "border-primary/40" : ""}`}>
                <CardContent className="py-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">{p.topic}</p>
                    <p className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString("es-ES")}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentProject(p.id, p.topic)}
                      className={currentProjectId === p.id ? "border-primary text-primary" : ""}
                    >
                      <FolderOpen className="w-3 h-3 mr-1" />
                      {currentProjectId === p.id ? "Activo" : "Abrir"}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(p.id)}>
                      <Trash2 className="w-3 h-3 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

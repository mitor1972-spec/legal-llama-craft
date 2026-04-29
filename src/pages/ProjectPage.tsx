import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "@/lib/store";
import {
  getProjects, createProject, deleteProject, generateClustersForProject,
  updateProject, getProjectById, generateProjectContext,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, FolderOpen, Plus, Loader2, Save, Wand2 } from "lucide-react";
import { toast } from "sonner";

const EMPTY_FORM = {
  topic: "",
  description: "",
  target_audience: "",
  secondary_keywords: "",
  exclude_topics: "",
  tone: "",
  geographic_focus: "",
  notes_general: "",
};

export default function ProjectPage() {
  const navigate = useNavigate();
  const { setCurrentProject } = useAppStore();
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [contextLoading, setContextLoading] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);

  const loadProjects = async () => {
    try {
      const data = await getProjects();
      setProjects(data || []);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  useEffect(() => { loadProjects(); }, []);

  const setField = (k: keyof typeof EMPTY_FORM, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const resetForm = () => { setForm(EMPTY_FORM); setEditingId(null); };

  const handleEdit = async (id: string) => {
    try {
      const p = await getProjectById(id);
      setForm({
        topic: p.topic || "",
        description: p.description || "",
        target_audience: p.target_audience || "",
        secondary_keywords: p.secondary_keywords || "",
        exclude_topics: p.exclude_topics || "",
        tone: p.tone || "",
        geographic_focus: p.geographic_focus || "",
        notes_general: p.notes_general || "",
      });
      setEditingId(id);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e: any) { toast.error(e.message); }
  };

  const handleAutoContext = async () => {
    if (!form.topic.trim()) return toast.error("Escribe primero la temática");
    if (!form.description.trim()) return toast.error("Escribe también una descripción / resumen del tema");
    setContextLoading(true);
    try {
      const ctx = await generateProjectContext(form.topic.trim(), form.description.trim());
      setForm((f) => ({
        ...f,
        description: ctx.description || f.description,
        target_audience: ctx.target_audience || f.target_audience,
        tone: ctx.tone || f.tone,
        secondary_keywords: ctx.secondary_keywords || f.secondary_keywords,
        exclude_topics: ctx.exclude_topics || f.exclude_topics,
        geographic_focus: ctx.geographic_focus || f.geographic_focus,
      }));
      toast.success("Contexto generado. Revísalo y añade notas si quieres.");
    } catch (e: any) { toast.error(e.message); }
    finally { setContextLoading(false); }
  };

  const handleCreate = async () => {
    if (!form.topic.trim()) return toast.error("Introduce una temática");
    setLoading(true);
    try {
      const payload = { ...form, topic: form.topic.trim() };
      const p = await createProject(payload);
      setCurrentProject(p.id, p.topic);
      toast.success("Proyecto creado. Generando clusters...");
      try {
        const count = await generateClustersForProject(p.id, p);
        toast.success(`${count} clusters generados y aprobados automáticamente`);
      } catch (err: any) {
        toast.error(`Error generando clusters: ${err.message}`);
      }
      resetForm();
      navigate(`/workspace/${p.id}`);
    } catch (e: any) {
      toast.error(e.message);
    } finally { setLoading(false); }
  };

  const handleSaveEdits = async () => {
    if (!editingId) return;
    if (!form.topic.trim()) return toast.error("La temática no puede estar vacía");
    setSaving(true);
    try {
      await updateProject(editingId, { ...form, topic: form.topic.trim() });
      toast.success("Proyecto actualizado");
      loadProjects();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteProject(id);
      if (editingId === id) resetForm();
      toast.success("Proyecto eliminado");
      loadProjects();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleOpen = (p: any) => {
    setCurrentProject(p.id, p.topic);
    navigate(`/workspace/${p.id}`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold mb-1">Proyectos</h2>
        <p className="text-muted-foreground text-sm">
          Crea un proyecto: define <strong>temática</strong> + <strong>descripción</strong>, opcionalmente genera el contexto con IA, y al crearlo se generarán automáticamente los clusters y abrirá el workspace unificado.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>{editingId ? "Editar proyecto" : "Nuevo proyecto"}</span>
            {editingId && <Button variant="ghost" size="sm" onClick={resetForm}>Cancelar edición</Button>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="topic">Temática principal *</Label>
            <Input
              id="topic"
              placeholder="Ej: Despidos disciplinarios y procedentes"
              value={form.topic}
              onChange={(e) => setField("topic", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="description">Descripción y subtemas *</Label>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleAutoContext}
                disabled={contextLoading || !form.topic.trim() || !form.description.trim()}
              >
                {contextLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Wand2 className="w-4 h-4 mr-1" />}
                Generar contexto con IA
              </Button>
            </div>
            <Textarea
              id="description"
              placeholder="Describe el tema, subtemas, casuísticas habituales..."
              rows={5}
              value={form.description}
              onChange={(e) => setField("description", e.target.value)}
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="audience">Audiencia objetivo</Label>
              <Textarea id="audience" rows={3} value={form.target_audience} onChange={(e) => setField("target_audience", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tone">Tono editorial</Label>
              <Textarea id="tone" rows={3} value={form.tone} onChange={(e) => setField("tone", e.target.value)} />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="kw">Palabras clave secundarias</Label>
              <Textarea id="kw" rows={3} value={form.secondary_keywords} onChange={(e) => setField("secondary_keywords", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="excl">Temas / ángulos a evitar</Label>
              <Textarea id="excl" rows={3} value={form.exclude_topics} onChange={(e) => setField("exclude_topics", e.target.value)} />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="geo">Foco geográfico</Label>
              <Input id="geo" placeholder="Ej: España nacional" value={form.geographic_focus} onChange={(e) => setField("geographic_focus", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notas adicionales</Label>
              <Input id="notes" value={form.notes_general} onChange={(e) => setField("notes_general", e.target.value)} />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            {editingId ? (
              <Button onClick={handleSaveEdits} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
                Guardar cambios
              </Button>
            ) : (
              <Button onClick={handleCreate} disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
                Crear proyecto y abrir workspace
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div>
        <h3 className="font-display text-lg font-semibold mb-3">Proyectos recientes</h3>
        {projects.length === 0 ? (
          <p className="text-muted-foreground text-sm">No hay proyectos aún.</p>
        ) : (
          <div className="space-y-2">
            {projects.map((p) => (
              <Card key={p.id}>
                <CardContent className="py-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">{p.topic}</p>
                    <p className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString("es-ES")}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleEdit(p.id)}>Editar</Button>
                    <Button variant="default" size="sm" onClick={() => handleOpen(p)}>
                      <FolderOpen className="w-3 h-3 mr-1" />
                      Abrir workspace
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
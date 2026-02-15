import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Download, Trash2, AlertTriangle } from "lucide-react";
import { updateTitle, exportWPAuto, exportNichoAI, sanitizeCommas } from "@/lib/api";
import { toast } from "sonner";

interface TitleBatchCardProps {
  run: any;
  clusterNames: Record<string, string>;
  onDelete: (runId: string) => void;
  onTitlesChanged: () => void;
}

export default function TitleBatchCard({ run, clusterNames, onDelete, onTitlesChanged }: TitleBatchCardProps) {
  const [open, setOpen] = useState(false);
  const [titles, setTitles] = useState(run.titles || []);

  const clusterIds = (run.cluster_ids_json || []) as string[];
  const usedClusterNames = clusterIds.map(id => clusterNames[id] || "?").filter(Boolean);
  const date = new Date(run.created_at).toLocaleString("es-ES", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

  const handleExport = (format: "wp" | "nicho") => {
    const items = titles.map((t: any) => t.text);
    const text = format === "wp" ? exportWPAuto(items) : exportNichoAI(items);
    navigator.clipboard.writeText(text);
    toast.success(`Batch exportado (${format === "wp" ? "WP Auto" : "Nicho.ai"}) — copiado al portapapeles`);
  };

  const fixCommas = () => {
    let fixed = 0;
    titles.forEach((t: any) => {
      if (t.text.includes(",")) {
        const newText = sanitizeCommas(t.text);
        updateTitle(t.id, { text: newText });
        t.text = newText;
        fixed++;
      }
    });
    if (fixed > 0) {
      setTitles([...titles]);
      onTitlesChanged();
      toast.success(`${fixed} títulos corregidos en este batch`);
    } else {
      toast.info("No hay comas en este batch");
    }
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="border-border/60">
        <CollapsibleTrigger asChild>
          <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 rounded-t-lg transition-colors">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {open ? <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
              <Badge variant="secondary" className="text-xs font-mono">{run.block_name}</Badge>
              <span className="text-sm font-medium truncate">{titles.length} títulos</span>
              <span className="text-xs text-muted-foreground hidden md:inline">{date}</span>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => handleExport("wp")}>
                <Download className="w-3 h-3 mr-1" /> WP
              </Button>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => handleExport("nicho")}>
                <Download className="w-3 h-3 mr-1" /> Nicho
              </Button>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive" onClick={() => onDelete(run.id)}>
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 pb-4 space-y-3">
            {/* Cluster tags */}
            {usedClusterNames.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {usedClusterNames.map((name, i) => (
                  <Badge key={i} variant="outline" className="text-[10px]">{name}</Badge>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="text-xs h-7" onClick={fixCommas}>
                <AlertTriangle className="w-3 h-3 mr-1" /> Fix comas
              </Button>
            </div>

            {/* Title rows */}
            <div className="space-y-1 max-h-[50vh] overflow-y-auto">
              {titles.map((t: any, i: number) => {
                const hasComma = t.text.includes(",");
                return (
                  <div key={t.id} className={`flex items-center gap-2 py-1 px-2 rounded text-sm ${hasComma ? "bg-destructive/10 border border-destructive/30" : "hover:bg-muted"}`}>
                    <span className="text-xs text-muted-foreground w-8 text-right">{i + 1}</span>
                    <Input
                      defaultValue={t.text}
                      onBlur={(e) => {
                        updateTitle(t.id, { text: e.target.value });
                        t.text = e.target.value;
                      }}
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
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "@/lib/store";

export default function TitlesPage() {
  const navigate = useNavigate();
  const { currentProjectId } = useAppStore();

  useEffect(() => {
    if (currentProjectId) {
      navigate(`/workspace/${currentProjectId}`, { replace: true });
    }
  }, [currentProjectId, navigate]);

  return (
    <div className="flex items-center justify-center h-64">
      <p className="text-muted-foreground">
        Selecciona un proyecto en la pestaña "Proyecto" para generar títulos.
      </p>
    </div>
  );
}
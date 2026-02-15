import { create } from "zustand";

interface AppState {
  currentProjectId: string | null;
  currentProjectTopic: string;
  setCurrentProject: (id: string | null, topic: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentProjectId: null,
  currentProjectTopic: "",
  setCurrentProject: (id, topic) => set({ currentProjectId: id, currentProjectTopic: topic }),
}));

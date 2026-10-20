import { Navigate, Route, Routes } from "react-router-dom";
import { ImportProjectDialog } from "./components/ImportProjectDialog.js";
import { ProjectViewerPage } from "./pages/ProjectViewerPage.js";
import { ProjectsPage } from "./pages/ProjectsPage.js";
import { StoreProvider } from "./state/StoreProvider.js";
import type { AppStore } from "./state/store.js";

export function App({ store }: { store?: AppStore } = {}) {
  return (
    <StoreProvider store={store}>
      <AppShell />
    </StoreProvider>
  );
}

function AppShell() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>DCV</h1>
        <p>Visor de cambios UML para proyectos TypeScript</p>
      </header>
      <Routes>
        <Route path="/" element={<ProjectsPage />} />
        <Route path="/projects/:projectId" element={<ProjectViewerPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ImportProjectDialog />
    </div>
  );
}

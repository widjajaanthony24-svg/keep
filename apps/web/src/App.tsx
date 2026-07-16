import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { getToken } from "./api/client";
import { LoginPage } from "./pages/LoginPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { ViewerPage } from "./pages/ViewerPage";
import { EditorPage } from "./pages/EditorPage";
import { PublicViewerPage } from "./pages/PublicViewerPage";

function RequireAuth({ children }: { children: ReactNode }) {
  return getToken() ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/share/:slug" element={<PublicViewerPage />} />
      <Route
        path="/projects"
        element={
          <RequireAuth>
            <ProjectsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/projects/:id"
        element={
          <RequireAuth>
            <ViewerPage />
          </RequireAuth>
        }
      />
      <Route
        path="/projects/:id/edit"
        element={
          <RequireAuth>
            <EditorPage />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to={getToken() ? "/projects" : "/login"} replace />} />
    </Routes>
  );
}

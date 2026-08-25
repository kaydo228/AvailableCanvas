/**
 * Маршруты приложения (FR-01): `/` — список проектов, `/p/:projectId` — холст.
 * Всё, чего нет, ведёт на список — белый экран пользователю показывать нечего.
 */

import { BrowserRouter, Navigate, Route, Routes } from 'react-router';

import { CanvasScreen } from '@/app/CanvasScreen';
import { ProjectsHeader } from '@/app/ProjectsHeader';
import { ProjectDialogs } from '@/features/projects/dialogs/ProjectDialogs';
import { ProjectsScreen } from '@/features/projects/ProjectsScreen';

function ProjectsRoute() {
  return (
    <div className="min-h-screen bg-[#fbfbfd]">
      <ProjectsHeader />
      <ProjectsScreen />
      <ProjectDialogs />
    </div>
  );
}

export function Router() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ProjectsRoute />} />
        <Route path="/p/:projectId" element={<CanvasScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

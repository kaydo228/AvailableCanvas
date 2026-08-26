/**
 * Маршруты приложения (FR-01): `/` — список проектов, `/p/:projectId` — холст.
 * Всё, чего нет, ведёт на список — белый экран пользователю показывать нечего.
 */

import { BrowserRouter, Navigate, Route, Routes } from 'react-router';

import { CanvasScreen } from '@/app/CanvasScreen';
import { ProjectsHeader } from '@/app/ProjectsHeader';
import { ProjectDialogs } from '@/features/projects/dialogs/ProjectDialogs';
import { ProjectsScreen } from '@/features/projects/ProjectsScreen';
import { AppToaster } from '@/shared/ui';

function ProjectsRoute() {
  return (
    <div className="min-h-screen bg-paper">
      <ProjectsHeader />
      <ProjectsScreen />
      <ProjectDialogs />
    </div>
  );
}

export function Router() {
  return (
    <BrowserRouter>
      {/*
        Тостер в корне, а не внутри ProjectDialogs или CanvasScreen: те
        рендерятся каждый на своём маршруте, и на холсте ошибки уходили
        в пустоту — отказ по размеру картинки не показывался вовсе.
        Экземпляр ровно один, иначе каждый тост двоится.
      */}
      <AppToaster />
      <Routes>
        <Route path="/" element={<ProjectsRoute />} />
        <Route path="/p/:projectId" element={<CanvasScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

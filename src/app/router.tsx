/**
 * Маршруты приложения (FR-01): `/` — список проектов, `/p/:projectId` — холст.
 * Всё, чего нет, ведёт на список — белый экран пользователю показывать нечего.
 */

import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';

import { ProjectsHeader } from '@/app/ProjectsHeader';
import { useCloudSyncOnLogin } from '@/features/cloud';
import { ProjectDialogs } from '@/features/projects/dialogs/ProjectDialogs';
import { ProjectsScreen } from '@/features/projects/ProjectsScreen';
import { AppToaster } from '@/shared/ui';

/**
 * Холст грузится отдельным куском и только когда на него зашли.
 *
 * Konva — две трети всего бандла, а на списке проектов она не нужна ни разу:
 * до 28 августа приложение приезжало одним файлом на 905 КБ, и человек,
 * открывший список, платил за движок холста, которого не увидит.
 *
 * `lazy` требует default-экспорт, а у экрана он именованный — трогать сам
 * экран ради формы импорта не стали, разворачиваем здесь.
 */
const CanvasScreen = lazy(async () => {
  const { CanvasScreen: Screen } = await import('@/app/CanvasScreen');
  return { default: Screen };
});

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
  // Круг синхронизации при входе — здесь, а не на экране холста: кнопка
  // «Войти» стоит на списке проектов, и человек обязан увидеть свои доски,
  // не открывая ни одной вручную. Хук смонтирован на всех маршрутах разом.
  useCloudSyncOnLogin();

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
        <Route
          path="/p/:projectId"
          element={
            /*
              Заглушка намеренно пустая, а не спиннер: холст приезжает
              за десятки миллисекунд с диска, и мелькнувший на этот срок
              спиннер читается как поломка, а не как загрузка. Фон совпадает
              с фоном экрана, поэтому переход выглядит как переход.
            */
            <Suspense fallback={<div className="h-screen bg-paper" />}>
              <CanvasScreen />
            </Suspense>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

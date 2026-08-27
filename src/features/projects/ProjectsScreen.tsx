/**
 * Экран списка проектов (FR-01, 6.1).
 *
 * `projects === null` означает «ещё грузим», пустой массив — «проектов нет».
 * Одно значение вместо флага isLoading: пустое состояние не мигает до конца
 * загрузки, а при перечитывании старый список остаётся на месте.
 */

import { useEffect, useState } from 'react';

import { listProjects } from '@/features/persistence';
import { subscribe } from '@/features/persistence/sync';
import { useProjectDialogs } from '@/features/projects/dialogsStore';
import type { Project } from '@/shared/types/document';

import { EmptyState } from './EmptyState';
import { ProjectCard } from './ProjectCard';

export const ProjectsScreen = () => {
  const [projects, setProjects] = useState<Project[] | null>(null);
  // Диалоги увеличивают revision после записи в IndexedDB — иначе переименование
  // и удаление не видно до перезагрузки страницы.
  const revision = useProjectDialogs((s) => s.revision);

  // biome-ignore lint/correctness/useExhaustiveDependencies: revision — намеренный триггер перечитывания, в теле эффекта не используется.
  useEffect(() => {
    let alive = true;
    const reread = () => {
      void listProjects().then((list) => {
        if (alive) setProjects(list);
      });
    };
    reread();

    // Соседняя вкладка могла создать, переименовать или удалить проект.
    // Без этого список врал до перезагрузки страницы, и «Переименовать»
    // открывалось над проектом, которого уже нет.
    const unsubscribe = subscribe(reread);

    return () => {
      alive = false;
      unsubscribe();
    };
  }, [revision]);

  if (projects === null) {
    return (
      <div className="grid min-h-[70vh] place-items-center font-mono text-faint text-micro">
        Открываем список…
      </div>
    );
  }

  if (projects.length === 0) return <EmptyState />;

  return (
    <div className="mx-auto max-w-[76rem] px-8 py-10">
      {/* Шапка со «Создать проект» живёт в app/ProjectsHeader — здесь только сетка,
          иначе на экране две одинаковые шапки. */}
      <div className="mb-5 flex items-baseline justify-between border-rule border-b pb-3">
        <h1 className="font-medium text-ink text-sm">Доски</h1>
        <span className="text-faint text-xs">
          <span className="font-mono tabular-nums">{projects.length}</span> · по дате изменения
        </span>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(13.5rem,1fr))] gap-x-4 gap-y-5">
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>
    </div>
  );
};

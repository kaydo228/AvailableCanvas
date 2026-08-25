/**
 * Экран списка проектов (FR-01, 6.1).
 *
 * `projects === null` означает «ещё грузим», пустой массив — «проектов нет».
 * Одно значение вместо флага isLoading: пустое состояние не мигает до конца
 * загрузки, а при перечитывании старый список остаётся на месте.
 */

import { useEffect, useState } from 'react';

import { listProjects } from '@/features/persistence';
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
    void listProjects().then((list) => {
      if (alive) setProjects(list);
    });
    return () => {
      alive = false;
    };
  }, [revision]);

  if (projects === null) {
    return <div className="grid min-h-[70vh] place-items-center text-slate-400">Загрузка…</div>;
  }

  if (projects.length === 0) return <EmptyState />;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* Шапка со «Создать проект» живёт в app/ProjectsHeader — здесь только сетка,
          иначе на экране две одинаковые шапки. */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-5">
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>
    </div>
  );
};

/**
 * Когда выгружать доску на сервер.
 *
 * Свой дебаунс — 3000 мс, отдельно от автосохранения (у того 500 мс,
 * `AUTOSAVE_DELAY_MS`): складывать их в один нельзя, иначе выгрузка на каждый
 * штрих съест квоту бесплатного тарифа. Триггер — переход `useSaveStatus`
 * в `saved`: раньше в документе просто нет свежей версии, которую стоило бы
 * везти на сервер.
 *
 * Без входа хук ничего не делает: `pushProject` требует владельца.
 *
 * Круг слияния при входе (`syncNow`) сюда не входит — он живёт в
 * `useCloudSyncOnLogin`, смонтированном на уровне приложения: этот хук здесь
 * привязан к конкретному экрану холста и не годится для «синхронизировать
 * сразу после входа», пока человек ещё на списке проектов.
 */

import { useEffect } from 'react';
import { useSaveStatus } from '@/features/persistence/autosave';
import type { Id } from '@/shared/types/document';

import { canEdit, type ProjectAccess } from './access';
import { pushProject } from './push';
import { useSession } from './session';

/** Пауза после сохранения в IndexedDB, прежде чем везти доску на сервер. */
export const CLOUD_PUSH_DELAY_MS = 3000;

/**
 * Отражает исход выгрузки в индикаторе: `false` — «Сохранено только здесь»,
 * `true` — обратно в «Все изменения сохранены».
 *
 * Тревожные состояния (`conflict`, `deleted`, `error`, `saving`) не трогаем:
 * они про другую проблему, и молчаливый откат в «сохранено» под ними был бы
 * враньём — вкладка всё ещё устарела или пишет локально с ошибкой.
 */
const reportPushResult = (ok: boolean): void => {
  const current = useSaveStatus.getState().status;
  if (current === 'saved' || current === 'local-only') {
    useSaveStatus.getState().setStatus(ok ? 'saved' : 'local-only');
  }
};

export const useCloudSync = (
  projectId: Id | undefined,
  access: ProjectAccess | undefined,
): void => {
  const userId = useSession((s) => s.userId);

  useEffect(() => {
    if (!projectId || !userId || !canEdit(access)) return;

    let timer: ReturnType<typeof setTimeout> | undefined;

    const unsubscribe = useSaveStatus.subscribe((state, previous) => {
      if (state.status !== 'saved' || previous.status === 'saved') return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        // Обнуляем до вызова: иначе cleanup ниже не отличит «таймер уже
        // сработал» от «ещё висит» и после каждой ушедшей выгрузки будет
        // слать лишнюю при любом следующем уходе с холста.
        timer = undefined;
        void pushProject(projectId, userId).then(reportPushResult);
      }, CLOUD_PUSH_DELAY_MS);
    });

    return () => {
      unsubscribe();
      if (timer !== undefined) {
        clearTimeout(timer);
        // Уход с холста внутри окна дебаунса не должен откладывать выгрузку
        // до следующего визита — последняя версия обязана уехать сразу.
        void pushProject(projectId, userId).then(reportPushResult);
      }
    };
  }, [access, projectId, userId]);
};

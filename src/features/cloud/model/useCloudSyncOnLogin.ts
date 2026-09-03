/**
 * Круг синхронизации при входе — на уровне приложения, а не экрана холста.
 *
 * Кнопка «Войти» стоит в шапке списка проектов (`ProjectsHeader`), а не на
 * холсте: человек, вошедший на новом устройстве, первым делом видит список,
 * и именно там должны появиться его доски — без захода на каждую вручную.
 * Поэтому хук ставится в `Router` (см. `src/app/router.tsx`) и смонтирован
 * всегда, независимо от маршрута.
 *
 * `syncedFor` держит того, для кого круг уже запущен — защита от двойного
 * вызова эффекта в React 18 StrictMode (dev вызывает эффект без cleanup
 * дважды подряд на одном и том же значении зависимости). Но, в отличие от
 * `useCloudSync` на холсте, этот хук не размонтируется вместе с экраном —
 * значит, выход из аккаунта обязан сбрасывать `syncedFor` сам: без этого
 * повторный вход тем же человеком в той же вкладке не завёл бы второй круг
 * никогда.
 *
 * После круга — `bumpRevision()`. `overwriteProject`/`deleteProject` внутри
 * `syncNow` шлют `projects-changed` через `BroadcastChannel`, а он по
 * стандарту не доставляет сообщение своему же отправителю (см. комментарий
 * в `features/persistence/sync.ts`) — это межвкладочный канал, не внутривкла-
 * дочный. Экран списка перечитывает себя по `revision` из `useProjectDialogs`
 * (тот же приём, что и диалоги создания/переименования/удаления), поэтому
 * без явного bump список, открытый в момент входа, не увидел бы результат
 * этого же круга синхронизации до перезахода.
 */

import { useEffect, useRef } from 'react';

import { useProjectDialogs } from '@/features/projects/dialogsStore';

import { connectRemoteImages } from './images';
import { syncNow } from './pull';
import { useSession } from './session';

export const useCloudSyncOnLogin = (): void => {
  const userId = useSession((s) => s.userId);
  const syncedFor = useRef<string | null>(null);

  useEffect(() => {
    // Фолбэк на картинки, которых нет локально: этот хук — единственное
    // место уровня приложения, которое всегда знает текущего userId, и он же
    // должен сбросить источник в null при выходе — иначе после логаута
    // хранилище продолжало бы ходить в сеть от имени уже вышедшего.
    connectRemoteImages(userId);

    if (!userId) {
      syncedFor.current = null;
      return;
    }
    if (syncedFor.current === userId) return;
    syncedFor.current = userId;
    void syncNow(userId).then(() => useProjectDialogs.getState().bumpRevision());
  }, [userId]);
};

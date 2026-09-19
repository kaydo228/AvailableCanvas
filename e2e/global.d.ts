import type { useBoardStore } from '@/shared/store/board';

declare global {
  interface Window {
    /** Ставится в main.tsx только при import.meta.env.DEV. */
    __board: typeof useBoardStore;
    /** Буфер замера в e2e/inspector.spec.ts. */
    __fills: string[];
    /** Замер в e2e/shortcuts.spec.ts. */
    __zPrevented: boolean | null;
    /** Подмена клиента Supabase из тестов. Ставится в DEV, см. cloud/model/client.ts. */
    __cloud: { setCloud: (client: unknown) => void };
    /** Буфер вызовов `rpc('save_project')` в e2e/cloud-push.spec.ts. */
    __saveProjectCalls: Array<{
      p_project_id: string;
      p_document: { nodes: Record<string, unknown> };
    }>;
    /** Переключатель отказа `save_project` в заглушке e2e/cloud-push.spec.ts. */
    __failSaveProject: boolean;
    /** Stateful Supabase harness for collaboration scenarios. */
    __collaboration: {
      projects: Record<string, Record<string, unknown>>;
      members: Array<{ project_id: string; user_id: string; email: string; role: string }>;
      invites: Array<{ id: string; project_id: string; email: string; role: string }>;
      rpcCalls: Array<{ name: string; args?: Record<string, unknown> }>;
      functionCalls: Array<{ name: string; body?: Record<string, unknown> }>;
      passwordUpdates: string[];
      failSaves: boolean;
      emitProjectUpdate(projectId: string, row: Record<string, unknown>): void;
      emitRevoked(projectId: string, userId: string): void;
      setActor(actor: { id: string; email: string }): void;
    };
    /** Счётчик кругов `syncNow` в заглушке e2e/cloud-pull.spec.ts — растёт на каждый remoteList. */
    __syncCalls: number;
    /** Пути `storage.download` в заглушке e2e/cloud-images.spec.ts — один на реально скачанный файл. */
    __downloads: string[];
    /**
     * `performance.now()` каждого вызова `remoteList` (select().eq('owner', ...))
     * в заглушке e2e/cloud-adopt.spec.ts — раунд правок 1. Считает моменты,
     * а не только число вызовов: доказывает, что второй круг СТАРТОВАЛ уже
     * после того, как первый успел завершиться, а не просто когда-то потом.
     */
    __ownerCallTimes: number[];
  }
}

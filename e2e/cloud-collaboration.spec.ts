import { expect, type Page, test } from '@playwright/test';

type Role = 'editor' | 'viewer';

interface Actor {
  id: string;
  email: string;
}

interface CollaborationProjectRow {
  id: string;
  owner: string;
  name: string;
  created_at: string;
  updated_at: string;
  thumbnail: string | null;
  document: {
    projectId: string;
    schemaVersion: number;
    nodes: Record<string, unknown>;
    order: string[];
    viewport: { x: number; y: number; zoom: number };
    background: { color: string; grid: string };
  };
  is_public: boolean;
  revision: number;
  updated_by: string | null;
}

interface CollaborationMember {
  project_id: string;
  user_id: string;
  email: string;
  role: Role;
  created_at?: string;
}

interface CollaborationInvite {
  id: string;
  project_id: string;
  email: string;
  role: Role;
  created_at?: string;
}

interface StubOptions {
  actor: Actor;
  projects?: CollaborationProjectRow[];
  members?: CollaborationMember[];
  invites?: CollaborationInvite[];
  online?: Actor[];
  registered?: Record<string, string>;
  failSaves?: boolean;
}

const stubCollaborationCloud = (options: StubOptions) => {
  type Session = { user: Actor };
  type ChannelHandler = {
    kind: string;
    filter: { event?: string };
    callback: (payload: { new?: CollaborationProjectRow }) => void;
  };

  let actor = structuredClone(options.actor);
  let session: Session | null = { user: actor };
  let authListener: ((event: string, next: Session | null) => void) | null = null;
  const registered = { ...options.registered };
  const channels = new Map<
    string,
    {
      handlers: ChannelHandler[];
      subscribeCallback?: (status: string) => void;
      channel?: unknown;
      presence: Record<string, Array<{ userId: string; email: string }>>;
    }
  >();

  const projects = Object.fromEntries(
    (options.projects ?? []).map((row) => [row.id, structuredClone(row)]),
  );
  const members = structuredClone(options.members ?? []);
  const invites = structuredClone(options.invites ?? []);

  const harness: Window['__collaboration'] = {
    projects,
    members,
    invites,
    rpcCalls: [],
    functionCalls: [],
    passwordUpdates: [],
    failSaves: options.failSaves ?? false,
    emitProjectUpdate(projectId, value) {
      const row = structuredClone(value) as unknown as CollaborationProjectRow;
      projects[projectId] = row as unknown as Record<string, unknown>;
      const channel = channels.get(`project:${projectId}`);
      for (const handler of channel?.handlers ?? []) {
        if (handler.kind === 'postgres_changes' && handler.filter.event === 'UPDATE') {
          handler.callback({ new: structuredClone(row) });
        }
      }
    },
    emitRevoked(projectId, userId) {
      const memberIndex = members.findIndex(
        (member) => member.project_id === projectId && member.user_id === userId,
      );
      if (memberIndex >= 0) members.splice(memberIndex, 1);
      const channel = channels.get(`project-access:${projectId}:${userId}`);
      for (const handler of channel?.handlers ?? []) {
        if (handler.kind === 'broadcast') handler.callback({});
      }
    },
    setActor(next) {
      actor = structuredClone(next);
      session = { user: actor };
      authListener?.('SIGNED_IN', session);
    },
  };
  window.__collaboration = harness;

  const visibleProjects = () => {
    const allowed = new Set(
      members.filter((member) => member.user_id === actor.id).map((member) => member.project_id),
    );
    return Object.values(projects).filter(
      (row) => row.owner === actor.id || allowed.has(row.id) || row.is_public,
    );
  };

  const projectSelect = () => {
    const result = () => ({ data: structuredClone(visibleProjects()), error: null });
    return Object.assign(Promise.resolve(result()), {
      eq: (_column: string, value: string) => ({
        single: async () => {
          const row = visibleProjects().find((item) => item.id === value);
          return row
            ? { data: structuredClone(row), error: null }
            : { data: null, error: { message: 'not found' } };
        },
      }),
    });
  };

  const memberMutation = (mode: 'update' | 'delete', patch?: { role: Role }) => {
    const filters = new Map<string, string>();
    const builder = {
      eq(column: string, value: string) {
        filters.set(column, value);
        return builder;
      },
      async select() {
        const matching = members.filter((member) =>
          [...filters].every(([column, value]) => {
            if (column === 'project_id') return member.project_id === value;
            if (column === 'user_id') return member.user_id === value;
            return false;
          }),
        );
        if (mode === 'update' && patch) {
          for (const member of matching) member.role = patch.role;
        } else {
          for (const member of matching) members.splice(members.indexOf(member), 1);
        }
        return { data: matching.map((member) => ({ user_id: member.user_id })), error: null };
      },
    };
    return builder;
  };

  const client = {
    auth: {
      getSession: async () => ({ data: { session } }),
      onAuthStateChange: (callback: (event: string, next: Session | null) => void) => {
        authListener = callback;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      signInWithPassword: async ({ email }: { email: string }) => {
        harness.setActor({ id: registered[email] ?? actor.id, email });
        return { data: { session, user: actor }, error: null };
      },
      signUp: async () => ({ data: { session: null, user: null }, error: null }),
      updateUser: async ({ password }: { password: string }) => {
        harness.passwordUpdates.push(password);
        return { data: { user: actor }, error: null };
      },
      signOut: async () => {
        session = null;
        authListener?.('SIGNED_OUT', null);
        return { error: null };
      },
    },
    functions: {
      invoke: async (name: string, invokeOptions: { body?: Record<string, unknown> }) => {
        harness.functionCalls.push({ name, body: invokeOptions.body });
        if (name !== 'invite-project-member') {
          return { data: null, error: { message: 'unknown function' } };
        }
        const body = invokeOptions.body ?? {};
        const projectId = body.projectId as string;
        const email = String(body.email ?? '')
          .trim()
          .toLowerCase();
        const role = body.role as Role;
        const userId = registered[email];
        if (userId) {
          const existing = members.find(
            (member) => member.project_id === projectId && member.user_id === userId,
          );
          if (existing) existing.role = role;
          else {
            members.push({
              project_id: projectId,
              user_id: userId,
              email,
              role,
              created_at: new Date().toISOString(),
            });
          }
          return { data: { status: 'member-added' }, error: null };
        }
        invites.push({
          id: `invite-${invites.length + 1}`,
          project_id: projectId,
          email,
          role,
          created_at: new Date().toISOString(),
        });
        return { data: { status: 'invite-sent' }, error: null };
      },
    },
    rpc: async (name: string, args?: Record<string, unknown>) => {
      harness.rpcCalls.push(args ? { name, args } : { name });
      if (name === 'accept_my_project_invites') {
        const accepted = invites.filter((invite) => invite.email === actor.email.toLowerCase());
        for (const invite of accepted) {
          members.push({
            project_id: invite.project_id,
            user_id: actor.id,
            email: actor.email,
            role: invite.role,
            created_at: new Date().toISOString(),
          });
          invites.splice(invites.indexOf(invite), 1);
        }
        return {
          data: accepted.map((invite) => ({ project_id: invite.project_id, role: invite.role })),
          error: null,
        };
      }
      if (name === 'list_project_members') {
        return {
          data: members
            .filter((member) => member.project_id === args?.p_project_id)
            .map((member) => ({
              user_id: member.user_id,
              email: member.email,
              role: member.role,
              created_at: member.created_at ?? new Date().toISOString(),
            })),
          error: null,
        };
      }
      if (name === 'set_project_public') {
        const row = projects[args?.p_project_id as string];
        if (!row) return { data: false, error: { message: 'not found' } };
        row.is_public = Boolean(args?.p_is_public);
        return { data: true, error: null };
      }
      if (name === 'save_project') {
        if (harness.failSaves) return { data: null, error: { message: 'network down' } };
        const projectId = args?.p_project_id as string;
        const previous = projects[projectId];
        const updatedAt = new Date().toISOString();
        const revision = (previous?.revision ?? 0) + 1;
        projects[projectId] = {
          id: projectId,
          owner: previous?.owner ?? actor.id,
          name: args?.p_name as string,
          created_at: args?.p_created_at as string,
          updated_at: updatedAt,
          thumbnail: (args?.p_thumbnail as string | null) ?? null,
          document: structuredClone(
            args?.p_document as unknown as CollaborationProjectRow['document'],
          ),
          is_public: previous?.is_public ?? false,
          revision,
          updated_by: actor.id,
        };
        harness.emitProjectUpdate(projectId, projects[projectId]);
        return { data: [{ revision, updated_at: updatedAt, updated_by: actor.id }], error: null };
      }
      return { data: null, error: { message: 'unknown rpc' } };
    },
    from: (table: string) => {
      if (table === 'projects') {
        return {
          select: () => projectSelect(),
          delete: () => ({
            eq: async (_column: string, value: string) => {
              delete projects[value];
              return { error: null };
            },
          }),
        };
      }
      if (table === 'project_invites') {
        return {
          select: () => ({
            eq: async (_column: string, value: string) => ({
              data: structuredClone(invites.filter((invite) => invite.project_id === value)),
              error: null,
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: async (_column: string, value: string) => ({
            data: structuredClone(
              members
                .filter((member) => member.user_id === value)
                .map((member) => ({ project_id: member.project_id, role: member.role })),
            ),
            error: null,
          }),
        }),
        update: (patch: { role: Role }) => memberMutation('update', patch),
        delete: () => memberMutation('delete'),
      };
    },
    channel: (name: string) => {
      const presence = Object.fromEntries(
        (options.online ?? []).map((online) => [
          online.id,
          [{ userId: online.id, email: online.email }],
        ]),
      );
      const state: {
        handlers: ChannelHandler[];
        subscribeCallback?: (status: string) => void;
        channel?: unknown;
        presence: Record<string, Array<{ userId: string; email: string }>>;
      } = {
        handlers: [],
        presence,
      };
      channels.set(name, state);
      const channel = {
        on(
          kind: string,
          filter: { event?: string },
          callback: (payload: { new?: CollaborationProjectRow }) => void,
        ) {
          state.handlers.push({ kind, filter, callback });
          return channel;
        },
        subscribe(callback?: (status: string) => void) {
          if (callback) {
            state.subscribeCallback = callback;
            callback('SUBSCRIBED');
          }
          return channel;
        },
        presenceState() {
          return structuredClone(state.presence);
        },
        async track(payload: { userId: string; email: string }) {
          state.presence[payload.userId] = [structuredClone(payload)];
          for (const handler of state.handlers) {
            if (handler.kind === 'presence' && handler.filter.event === 'sync') {
              handler.callback({});
            }
          }
          return 'ok';
        },
      };
      state.channel = channel;
      return channel;
    },
    removeChannel: async (channel: unknown) => {
      for (const [name, state] of channels) {
        if (state.channel === channel) channels.delete(name);
      }
      return 'ok';
    },
    realtime: { setAuth: async () => {} },
  };

  Object.defineProperty(window, '__cloud', {
    configurable: true,
    set(value: { setCloud: (next: unknown) => void }) {
      value.setCloud(client);
    },
    get() {
      return { setCloud: () => {} };
    },
  });
};

const actor = (id: string, email: string): Actor => ({ id, email });

const projectRow = (
  accessOwner = 'owner-1',
  nodes: Record<string, unknown> = {},
): CollaborationProjectRow => ({
  id: 'shared-1',
  owner: accessOwner,
  name: 'Общий проект',
  created_at: '2026-09-18T09:00:00.000Z',
  updated_at: '2026-09-18T10:00:00.000Z',
  thumbnail: null,
  document: {
    projectId: 'shared-1',
    schemaVersion: 1,
    nodes,
    order: Object.keys(nodes),
    viewport: { x: 0, y: 0, zoom: 1 },
    background: { color: '#fbfbfd', grid: 'dots' },
  },
  is_public: false,
  revision: 1,
  updated_by: accessOwner,
});

const shape = (id: string) => ({
  id,
  type: 'shape',
  shape: 'rect',
  x: 80,
  y: 80,
  width: 100,
  height: 60,
  rotation: 0,
  opacity: 1,
  locked: false,
  fill: '#ff5544',
  stroke: '#f8fafc',
  strokeWidth: 2,
});

const openProject = async (page: Page) => {
  await expect(page.getByText('Общий проект', { exact: true })).toBeVisible();
  await page.getByText('Общий проект', { exact: true }).click();
  await expect(page).toHaveURL(/\/p\/shared-1$/);
  await expect(page.getByRole('application', { name: 'Холст доски' })).toBeVisible();
};

const openAccess = async (page: Page) => {
  await page.getByRole('button', { name: 'Доступ' }).click();
  const dialog = page.getByRole('dialog', { name: 'Доступ к проекту' });
  await expect(dialog).toBeVisible();
  return dialog;
};

const install = async (page: Page, options: StubOptions, path = '/') => {
  await page.addInitScript(stubCollaborationCloud, options);
  await page.goto(path);
};

const addShape = (page: Page, id: string) =>
  page.evaluate((nodeId) => {
    window.__board.getState().addNode({
      id: nodeId,
      type: 'shape',
      shape: 'rect',
      x: 10,
      y: 10,
      width: 80,
      height: 40,
      rotation: 0,
      opacity: 1,
      locked: false,
      fill: '#ff0000',
      stroke: '#111111',
      strokeWidth: 1,
    });
  }, id);

const boardSnapshot = (page: Page) =>
  page.evaluate(() => {
    const document = window.__board.getState().document;
    return document
      ? structuredClone({
          nodes: document.nodes,
          order: document.order,
          background: document.background,
        })
      : null;
  });

const tryViewerMutations = async (page: Page) => {
  const canvas = page.getByRole('application', { name: 'Холст доски' });
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas has no box');
  const x = box.x + 120;
  const y = box.y + 120;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 70, y + 40, { steps: 4 });
  await page.mouse.up();
  await page.mouse.dblclick(x, y);
  await page.keyboard.press('Delete');
  await page.keyboard.press('Meta+V');
  await canvas.evaluate((element) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['viewer'], 'viewer.png', { type: 'image/png' }));
    element.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: transfer }));
  });
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => indexedDB.deleteDatabase('prostor'));
});

test('незарегистрированный viewer получает приглашение и pending-строку', async ({ page }) => {
  await install(page, { actor: actor('owner-1', 'owner@example.com'), projects: [projectRow()] });
  await openProject(page);
  const dialog = await openAccess(page);
  await dialog.getByLabel('Почта').fill('new-viewer@example.com');
  await dialog.getByLabel('Роль').selectOption('viewer');
  await dialog.getByRole('button', { name: 'Пригласить' }).click();

  await expect(page.locator('[data-sonner-toast]')).toContainText('Приглашение отправлено');
  await expect(dialog.getByText('new-viewer@example.com')).toBeVisible();
  expect(await page.evaluate(() => window.__collaboration.invites)).toMatchObject([
    { project_id: 'shared-1', email: 'new-viewer@example.com', role: 'viewer' },
  ]);
});

test('зарегистрированный editor сразу получает доступ', async ({ page }) => {
  await install(page, {
    actor: actor('owner-1', 'owner@example.com'),
    projects: [projectRow()],
    registered: { 'editor@example.com': 'editor-1' },
  });
  await openProject(page);
  const dialog = await openAccess(page);
  await dialog.getByLabel('Почта').fill('editor@example.com');
  await dialog.getByLabel('Роль').selectOption('editor');
  await dialog.getByRole('button', { name: 'Пригласить' }).click();

  await expect(page.locator('[data-sonner-toast]')).toContainText('Доступ добавлен');
  await expect(dialog.getByText('editor@example.com')).toBeVisible();
  expect(await page.evaluate(() => window.__collaboration.members)).toMatchObject([
    { project_id: 'shared-1', user_id: 'editor-1', role: 'editor' },
  ]);
});

test('владелец меняет роль и удаляет участника', async ({ page }) => {
  await install(page, {
    actor: actor('owner-1', 'owner@example.com'),
    projects: [projectRow()],
    members: [
      {
        project_id: 'shared-1',
        user_id: 'editor-1',
        email: 'editor@example.com',
        role: 'editor',
      },
    ],
  });
  await openProject(page);
  const dialog = await openAccess(page);
  await dialog.getByLabel('Роль для editor@example.com').selectOption('viewer');
  await expect(page.locator('[data-sonner-toast]')).toContainText('Роль обновлена');
  await expect
    .poll(() => page.evaluate(() => window.__collaboration.members[0]?.role))
    .toBe('viewer');

  await dialog.getByRole('button', { name: 'Удалить editor@example.com' }).click();
  await expect(
    page.locator('[data-sonner-toast]').filter({ hasText: 'Участник удалён' }),
  ).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__collaboration.members.length)).toBe(0);
});

test('invite-route задаёт пароль, принимает приглашение и открывает проект', async ({ page }) => {
  await install(
    page,
    {
      actor: actor('viewer-1', 'viewer@example.com'),
      projects: [projectRow()],
      invites: [
        {
          id: 'invite-1',
          project_id: 'shared-1',
          email: 'viewer@example.com',
          role: 'viewer',
        },
      ],
    },
    '/invite',
  );

  await page.getByLabel('Новый пароль').fill('secret123');
  await page.getByRole('button', { name: 'Принять и открыть проект' }).click();
  await expect(page).toHaveURL(/\/p\/shared-1$/);
  await expect(page.getByText('Только просмотр')).toBeVisible();
  expect(await page.evaluate(() => window.__collaboration.passwordUpdates)).toEqual(['secret123']);
  expect(await page.evaluate(() => window.__collaboration.invites)).toHaveLength(0);
});

test('viewer не меняет доску, но может двигать вид и экспортировать', async ({ page }) => {
  await install(page, {
    actor: actor('viewer-1', 'viewer@example.com'),
    projects: [projectRow('owner-1', { original: shape('original') })],
    members: [
      {
        project_id: 'shared-1',
        user_id: 'viewer-1',
        email: 'viewer@example.com',
        role: 'viewer',
      },
    ],
  });
  await openProject(page);
  await expect(page.getByText('Только просмотр')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Выбор (V)' })).toHaveCount(0);
  await expect(page.getByText('Свойства', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Доступ' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Экспорт' })).toBeVisible();

  const before = await boardSnapshot(page);
  await tryViewerMutations(page);
  expect(await boardSnapshot(page)).toEqual(before);

  const viewport = await page.evaluate(() => {
    window.__board.getState().panBy(45, -30);
    window.__board.getState().zoomAt({ x: 100, y: 100 }, 0.4);
    return window.__board.getState().document?.viewport;
  });
  expect(viewport).not.toEqual({ x: 0, y: 0, zoom: 1 });
});

test('шапка показывает участников, у которых открыт проект', async ({ page }) => {
  await install(page, {
    actor: actor('owner-1', 'owner@example.com'),
    projects: [projectRow()],
    online: [actor('owner-1', 'owner@example.com'), actor('editor-1', 'editor@example.com')],
  });
  await openProject(page);

  await expect(page.getByRole('group', { name: 'В сети: 2' })).toBeVisible();
  await expect(page.getByText('owner@example.com (Вы) — в сети')).toBeAttached();
  await expect(page.getByText('editor@example.com — в сети')).toBeAttached();
});

test('editor редактирует и отправляет один save_project', async ({ page }) => {
  await install(page, {
    actor: actor('editor-1', 'editor@example.com'),
    projects: [projectRow()],
    members: [
      {
        project_id: 'shared-1',
        user_id: 'editor-1',
        email: 'editor@example.com',
        role: 'editor',
      },
    ],
  });
  await openProject(page);
  await expect(page.getByText('Совместный проект')).toBeVisible();
  await addShape(page, 'editor-shape');
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            window.__collaboration.rpcCalls.filter((call) => call.name === 'save_project').length,
        ),
      { timeout: 5000 },
    )
    .toBe(1);
  expect(
    await page.evaluate(() => {
      const call = window.__collaboration.rpcCalls.find((item) => item.name === 'save_project');
      const document = call?.args?.p_document as { nodes?: Record<string, unknown> } | undefined;
      return Object.keys(document?.nodes ?? {});
    }),
  ).toContain('editor-shape');
});

test('чужая revision доходит до второй страницы и сохраняет её viewport', async ({ context }) => {
  await context.addInitScript(stubCollaborationCloud, {
    actor: actor('editor-1', 'editor@example.com'),
    projects: [projectRow()],
    members: [
      {
        project_id: 'shared-1',
        user_id: 'editor-1',
        email: 'editor@example.com',
        role: 'editor',
      },
    ],
  });
  const secondPage = await context.newPage();
  await secondPage.goto('/');
  await openProject(secondPage);
  const localViewport = { x: 121, y: -73, zoom: 1.4 };
  await secondPage.evaluate(
    (viewport) => window.__board.getState().setViewport(viewport),
    localViewport,
  );

  await secondPage.evaluate((remoteShape) => {
    const current = window.__collaboration.projects['shared-1'];
    if (!current) throw new Error('missing project');
    window.__collaboration.emitProjectUpdate('shared-1', {
      ...current,
      revision: 2,
      updated_at: '2026-09-18T11:00:00.000Z',
      updated_by: 'owner-1',
      document: {
        ...(current.document as Record<string, unknown>),
        nodes: { remote: remoteShape },
        order: ['remote'],
        viewport: { x: 999, y: 999, zoom: 3 },
      },
    });
  }, shape('remote'));

  await expect
    .poll(() =>
      secondPage.evaluate(() => Object.keys(window.__board.getState().document?.nodes ?? {})),
    )
    .toContain('remote');
  expect(await secondPage.evaluate(() => window.__board.getState().document?.viewport)).toEqual(
    localViewport,
  );
});

test('собственная revision не перезагружает документ и не создаёт save-эхо', async ({ page }) => {
  await install(page, {
    actor: actor('editor-1', 'editor@example.com'),
    projects: [projectRow()],
    members: [
      {
        project_id: 'shared-1',
        user_id: 'editor-1',
        email: 'editor@example.com',
        role: 'editor',
      },
    ],
  });
  await openProject(page);
  await addShape(page, 'fresh-local');
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            window.__collaboration.rpcCalls.filter((call) => call.name === 'save_project').length,
        ),
      { timeout: 5000 },
    )
    .toBe(1);

  await expect
    .poll(() => page.evaluate(() => Object.keys(window.__board.getState().document?.nodes ?? {})))
    .toContain('fresh-local');
  expect(
    await page.evaluate(
      () => window.__collaboration.rpcCalls.filter((call) => call.name === 'save_project').length,
    ),
  ).toBe(1);
});

test('отзыв доступа удаляет локальную запись и показывает понятное состояние', async ({ page }) => {
  await install(page, {
    actor: actor('viewer-1', 'viewer@example.com'),
    projects: [projectRow()],
    members: [
      {
        project_id: 'shared-1',
        user_id: 'viewer-1',
        email: 'viewer@example.com',
        role: 'viewer',
      },
    ],
  });
  await openProject(page);
  await page.evaluate(() => window.__collaboration.emitRevoked('shared-1', 'viewer-1'));

  await expect(page.getByText('Доступ отозван', { exact: true }).first()).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const request = indexedDB.open('prostor');
        const db = await new Promise<IDBDatabase>((resolve) => {
          request.onsuccess = () => resolve(request.result);
        });
        const query = db.transaction('projects').objectStore('projects').get('shared-1');
        return new Promise<boolean>((resolve) => {
          query.onsuccess = () => resolve(query.result === undefined);
        });
      }),
    )
    .toBe(true);
  await expect(page.getByRole('button', { name: 'Экспорт' })).toBeVisible();
});

test('ошибка сети оставляет dirty и показывает «Сохранено только здесь»', async ({ page }) => {
  await install(page, {
    actor: actor('editor-1', 'editor@example.com'),
    projects: [projectRow()],
    members: [
      {
        project_id: 'shared-1',
        user_id: 'editor-1',
        email: 'editor@example.com',
        role: 'editor',
      },
    ],
    failSaves: true,
  });
  await openProject(page);
  await addShape(page, 'offline-shape');

  await expect(page.getByText('Сохранено только здесь')).toBeVisible({ timeout: 5000 });
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const request = indexedDB.open('prostor');
        const db = await new Promise<IDBDatabase>((resolve) => {
          request.onsuccess = () => resolve(request.result);
        });
        const query = db.transaction('sync').objectStore('sync').get('shared-1');
        return new Promise<boolean>((resolve) => {
          query.onsuccess = () => resolve(query.result?.dirty === true);
        });
      }),
    )
    .toBe(true);
});

import { createClient } from 'npm:@supabase/supabase-js@2.114.0';

import {
  InviteError,
  type InviteInput,
  type InviteRole,
  inviteProjectMember,
} from './logic.ts';

const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Origin': '*',
};

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Используйте POST-запрос' }, 400);

  const authorization = request.headers.get('Authorization');
  if (!authorization) return json({ error: 'Сначала войдите в аккаунт' }, 401);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const appUrl = Deno.env.get('APP_URL');
  if (!url || !anonKey || !serviceKey || !appUrl) {
    return json({ error: 'Сервис приглашений пока не настроен' }, 503);
  }

  try {
    const caller = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: userData, error: userError } = await caller.auth.getUser();
    const actor = userData.user;
    if (userError || !actor?.email) return json({ error: 'Сессия недействительна' }, 401);

    const input = (await request.json()) as InviteInput;
    const redirectTo = new URL('invite', appUrl).toString();
    const outcome = await inviteProjectMember(input, {
      actorId: actor.id,
      actorEmail: actor.email,
      isOwner: async (projectId, actorId) => {
        const { data, error } = await caller
          .from('projects')
          .select('owner')
          .eq('id', projectId)
          .maybeSingle();
        if (error) throw error;
        return data?.owner === actorId;
      },
      lookupUser: async (email) => {
        const { data, error } = await admin.rpc('lookup_auth_user', { p_email: email });
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : undefined;
        return row
          ? { userId: row.user_id as string, confirmed: Boolean(row.confirmed) }
          : null;
      },
      upsertMember: async (projectId, userId, role) => {
        const { error } = await admin
          .from('project_members')
          .upsert(
            { project_id: projectId, user_id: userId, role },
            { onConflict: 'project_id,user_id' },
          );
        if (error) throw error;
      },
      upsertInvite: async (projectId, email, role) => {
        const existing = await admin
          .from('project_invites')
          .select('project_id')
          .eq('project_id', projectId)
          .eq('email', email)
          .maybeSingle();
        if (existing.error) throw existing.error;

        const { error } = await admin.from('project_invites').upsert(
          {
            project_id: projectId,
            email,
            role,
            invited_by: actor.id,
          },
          { onConflict: 'project_id,email' },
        );
        if (error) throw error;
        return { created: !existing.data };
      },
      deleteInvite: async (projectId, email) => {
        const { error } = await admin
          .from('project_invites')
          .delete()
          .eq('project_id', projectId)
          .eq('email', email);
        if (error) throw error;
      },
      sendInvite: async (email, resend) => {
        const result = resend
          ? await admin.auth.resend({
              type: 'signup',
              email,
              options: { emailRedirectTo: redirectTo },
            })
          : await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
        if (result.error) throw result.error;
      },
    });

    return json(outcome);
  } catch (error) {
    if (error instanceof InviteError) return json({ error: error.message }, error.status);
    console.error('invite-project-member failed', error);
    return json({ error: 'Сервис приглашений временно недоступен' }, 503);
  }
});

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface UserProfile {
  id: string;
  user_id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  phone: string | null;
  is_online: boolean;
  last_seen: string;
  created_at: string;
  updated_at: string;
  role?: 'admin' | 'manager' | 'operator';
}

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('name');

      if (profilesError) throw profilesError;

      // Fetch roles for all users
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');

      if (rolesError) throw rolesError;

      // Map roles to profiles
      const roleMap = new Map(roles?.map(r => [r.user_id, r.role]));
      
      return (profiles || []).map(profile => ({
        ...profile,
        role: roleMap.get(profile.user_id) || 'operator',
      })) as UserProfile[];
    },
  });
}

export function useUser(userId: string) {
  return useQuery({
    queryKey: ['users', userId],
    queryFn: async () => {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (profileError) throw profileError;
      if (!profile) return null;

      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle();

      return {
        ...profile,
        role: roleData?.role || 'operator',
      } as UserProfile;
    },
    enabled: !!userId,
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      ...input
    }: {
      userId: string;
      name?: string;
      phone?: string;
      avatar_url?: string;
    }) => {
      const { data, error } = await supabase
        .from('profiles')
        .update(input)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('Perfil atualizado com sucesso!');
    },
    onError: (error: Error) => {
      toast.error('Erro ao atualizar perfil: ' + error.message);
    },
  });
}

export function useUpdateUserRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      role,
    }: {
      userId: string;
      role: 'admin' | 'manager' | 'operator';
    }) => {
      // First delete existing role
      await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId);

      // Then insert new role
      const { error } = await supabase
        .from('user_roles')
        .insert({ user_id: userId, role });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('Nível do usuário atualizado!');
    },
    onError: (error: Error) => {
      toast.error('Erro ao atualizar nível: ' + error.message);
    },
  });
}

export function useOnlineUsers() {
  return useQuery({
    queryKey: ['online-users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('is_online', true);

      if (error) throw error;
      return (data || []) as UserProfile[];
    },
  });
}

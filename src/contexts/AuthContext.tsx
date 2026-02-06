import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

type AppRole = 'super_admin' | 'admin' | 'manager' | 'operator';

interface Profile {
  id: string;
  user_id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  phone: string | null;
  is_online: boolean;
  tenant_id: string | null;
}

interface Tenant {
  id: string;
  name: string;
  slug: string;
  custom_domain: string | null;
  plan: string;
  is_active: boolean;
  affiliate_code: string;
  commission_rate: number;
}

interface UserPermission {
  module: string;
  can_view: boolean;
  can_edit: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  role: AppRole | null;
  tenant: Tenant | null;
  permissions: UserPermission[];
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, name?: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  hasPermission: (module: string, action: 'view' | 'edit') => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [permissions, setPermissions] = useState<UserPermission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        // Defer profile/role fetch with setTimeout to avoid deadlock
        if (session?.user) {
          setTimeout(() => {
            fetchUserData(session.user.id);
          }, 0);
        } else {
          setProfile(null);
          setRole(null);
          setTenant(null);
          setPermissions([]);
          setLoading(false);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        fetchUserData(session.user.id);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserData = async (userId: string) => {
    try {
      // Fetch profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      
      if (profileData) {
        setProfile(profileData as Profile);
        
        // Fetch tenant if user has tenant_id
        if (profileData.tenant_id) {
          const { data: tenantData } = await supabase
            .from('tenants')
            .select('*')
            .eq('id', profileData.tenant_id)
            .maybeSingle();
          
          if (tenantData) {
            setTenant(tenantData as Tenant);
          }
        }
      }

      // Fetch role
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle();
      
      if (roleData) {
        // Map old roles to new structure
        const dbRole = roleData.role as string;
        let mappedRole: AppRole;
        
        if (dbRole === 'super_admin') {
          mappedRole = 'super_admin';
        } else if (dbRole === 'admin') {
          mappedRole = 'admin';
        } else if (dbRole === 'manager') {
          mappedRole = 'manager';
        } else {
          mappedRole = 'operator';
        }
        
        setRole(mappedRole);
        
        // Only fetch permissions for non-admin users
        if (mappedRole !== 'super_admin' && mappedRole !== 'admin') {
          const { data: permissionsData } = await supabase
            .from('user_permissions')
            .select('module, can_view, can_edit')
            .eq('user_id', userId);
          
          if (permissionsData) {
            setPermissions(permissionsData);
          }
        } else {
          // Super admins and admins have all permissions
          setPermissions([]);
        }
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signUp = async (email: string, password: string, name?: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          name: name || email.split('@')[0],
        },
      },
    });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setRole(null);
    setTenant(null);
    setPermissions([]);
  };

  const isSuperAdmin = role === 'super_admin';
  const isAdmin = role === 'admin' || role === 'super_admin';

  // Check if user has permission for a module and action
  const hasPermission = (module: string, action: 'view' | 'edit'): boolean => {
    // Super admins and admins have all permissions
    if (isSuperAdmin || isAdmin) return true;
    
    // Se nao ha permissoes configuradas, permitir acesso por padrao
    if (permissions.length === 0) return true;
    
    const permission = permissions.find(p => p.module === module);
    if (!permission) return false;
    
    return action === 'view' ? permission.can_view : permission.can_edit;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        role,
        tenant,
        permissions,
        loading,
        signIn,
        signUp,
        signOut,
        isSuperAdmin,
        isAdmin,
        hasPermission,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
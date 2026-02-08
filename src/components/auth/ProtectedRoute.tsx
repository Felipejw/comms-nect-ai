import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ROUTE_TO_MODULE } from "@/hooks/usePermissions";
import { Loader2, ShieldAlert, LogOut, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ProtectedRouteProps {
  children: ReactNode;
  module?: string;
  requiredAction?: "view" | "edit";
}

export function ProtectedRoute({ 
  children, 
  module, 
  requiredAction = "view" 
}: ProtectedRouteProps) {
  const { user, loading, hasPermission, isAdmin, role, refreshUserData, signOut } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (role === null) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background p-6">
        <div className="text-center space-y-6 max-w-md">
          <div className="mx-auto w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center">
            <ShieldAlert className="w-10 h-10 text-destructive" />
          </div>
          
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">Não foi possível carregar suas permissões</h1>
            <p className="text-muted-foreground">
              Ocorreu um erro ao verificar seu nível de acesso. 
              Tente novamente ou entre em contato com o administrador.
            </p>
          </div>

          <div className="flex gap-3 justify-center">
            <Button onClick={() => refreshUserData()} variant="default" className="gap-2">
              <RefreshCw className="w-4 h-4" />
              Tentar novamente
            </Button>
            <Button onClick={() => signOut()} variant="outline" className="gap-2">
              <LogOut className="w-4 h-4" />
              Sair
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (isAdmin) {
    return <>{children}</>;
  }

  if (module && !hasPermission(module, requiredAction)) {
    return <Navigate to="/acesso-negado" replace />;
  }

  return <>{children}</>;
}

export function getModuleFromPath(path: string): string | undefined {
  return ROUTE_TO_MODULE[path];
}

import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ROUTE_TO_MODULE } from "@/hooks/usePermissions";
import { Loader2 } from "lucide-react";

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
  const { user, loading, hasPermission, isAdmin, role } = useAuth();

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
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
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

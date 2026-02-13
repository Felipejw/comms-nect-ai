import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSystemSettings } from "@/hooks/useSystemSettings";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { getSetting } = useSystemSettings();
  const platformName = getSetting("platform_name") || "TalkFlow";

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background animate-fade-in">
      <div className="text-center px-6">
        <div className="w-20 h-20 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-6">
          <SearchX className="w-10 h-10 text-muted-foreground" />
        </div>
        <h1 className="mb-2 text-5xl font-bold text-foreground">404</h1>
        <p className="mb-2 text-xl font-medium text-foreground">Página não encontrada</p>
        <p className="mb-6 text-sm text-muted-foreground max-w-sm mx-auto">
          A página que você está procurando não existe ou foi movida no {platformName}.
        </p>
        <Button onClick={() => navigate("/dashboard")} size="lg">
          Voltar ao Início
        </Button>
      </div>
    </div>
  );
};

export default NotFound;

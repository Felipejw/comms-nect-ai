import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Palette, Moon, Sun, Bell, LogOut } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

export function CustomizeTab() {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const handleThemeChange = (value: "light" | "dark" | "system") => {
    setTheme(value);
    document.documentElement.classList.remove("light", "dark");
    if (value !== "system") {
      document.documentElement.classList.add(value);
    }
    toast.success(
      `Tema alterado para ${
        value === "light" ? "Claro" : value === "dark" ? "Escuro" : "Sistema"
      }`
    );
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <div className="space-y-6">
      <div className="bg-card rounded-lg p-6 space-y-6">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <Palette className="w-5 h-5 text-primary" />
          Aparência
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="flex items-center gap-2">
              {theme === "dark" ? (
                <Moon className="w-4 h-4" />
              ) : (
                <Sun className="w-4 h-4" />
              )}
              Tema
            </Label>
            <p className="text-sm text-muted-foreground">
              Escolha o tema da interface
            </p>
          </div>
          <Select value={theme} onValueChange={handleThemeChange}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">Claro</SelectItem>
              <SelectItem value="dark">Escuro</SelectItem>
              <SelectItem value="system">Sistema</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Separator />

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="flex items-center gap-2">
              <Bell className="w-4 h-4" />
              Notificações
            </Label>
            <p className="text-sm text-muted-foreground">
              Receber notificações do sistema
            </p>
          </div>
          <Switch
            checked={notificationsEnabled}
            onCheckedChange={setNotificationsEnabled}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Som de Notificações</Label>
            <p className="text-sm text-muted-foreground">
              Reproduzir som ao receber mensagens
            </p>
          </div>
          <Switch checked={soundEnabled} onCheckedChange={setSoundEnabled} />
        </div>
      </div>

      {/* Sign Out */}
      <div className="bg-card rounded-lg p-6">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" className="w-full" size="lg">
              <LogOut className="w-4 h-4 mr-2" />
              Sair da Conta
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Sair da conta?</AlertDialogTitle>
              <AlertDialogDescription>
                Você será desconectado do sistema e precisará fazer login
                novamente.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleSignOut}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Sair
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

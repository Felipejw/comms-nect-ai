import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Palette, Moon, Sun, Bell, LogOut, Building2, Upload, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { supabase } from "@/integrations/supabase/client";

export function CustomizeTab() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const { getSetting, createOrUpdateSetting, isLoading } = useSystemSettings();

  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Branding state
  const [platformName, setPlatformName] = useState("");
  const [platformLogo, setPlatformLogo] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#3B82F6");
  const [secondaryColor, setSecondaryColor] = useState("#10B981");
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Load settings when available
  useEffect(() => {
    if (!isLoading) {
      setPlatformName(getSetting("platform_name") || "TalkFlow");
      setPlatformLogo(getSetting("platform_logo") || "");
      const savedPrimary = getSetting("primary_color");
      const savedSecondary = getSetting("secondary_color");
      if (savedPrimary) setPrimaryColor(savedPrimary);
      if (savedSecondary) setSecondaryColor(savedSecondary);
    }
  }, [isLoading, getSetting]);

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

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Por favor, selecione uma imagem válida");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error("A imagem deve ter no máximo 2MB");
      return;
    }

    setIsUploading(true);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `logo-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("platform-assets")
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("platform-assets")
        .getPublicUrl(fileName);

      setPlatformLogo(urlData.publicUrl);
      toast.success("Logo enviado com sucesso!");
    } catch (error) {
      console.error("Erro ao fazer upload:", error);
      toast.error("Erro ao enviar logo");
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveLogo = () => {
    setPlatformLogo("");
  };

  const handleSaveBranding = async () => {
    setIsSaving(true);
    try {
      await createOrUpdateSetting.mutateAsync({
        key: "platform_name",
        value: platformName,
        description: "Nome da plataforma",
        category: "branding",
      });

      await createOrUpdateSetting.mutateAsync({
        key: "platform_logo",
        value: platformLogo,
        description: "URL do logotipo da plataforma",
        category: "branding",
      });

      await createOrUpdateSetting.mutateAsync({
        key: "primary_color",
        value: primaryColor,
        description: "Cor primária da plataforma",
        category: "branding",
      });

      await createOrUpdateSetting.mutateAsync({
        key: "secondary_color",
        value: secondaryColor,
        description: "Cor secundária da plataforma",
        category: "branding",
      });

      // Apply colors to CSS variables
      applyColors(primaryColor, secondaryColor);

      toast.success("Identidade da plataforma salva com sucesso!");
    } catch (error) {
      console.error("Erro ao salvar:", error);
      toast.error("Erro ao salvar configurações");
    } finally {
      setIsSaving(false);
    }
  };

  const applyColors = (primary: string, secondary: string) => {
    if (primary) {
      const hsl = hexToHSL(primary);
      document.documentElement.style.setProperty("--primary", hsl);
    }
    if (secondary) {
      const hsl = hexToHSL(secondary);
      document.documentElement.style.setProperty("--secondary", hsl);
    }
  };

  // Convert HEX to HSL string
  const hexToHSL = (hex: string): string => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return "0 0% 0%";

    let r = parseInt(result[1], 16) / 255;
    let g = parseInt(result[2], 16) / 255;
    let b = parseInt(result[3], 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r:
          h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
          break;
        case g:
          h = ((b - r) / d + 2) / 6;
          break;
        case b:
          h = ((r - g) / d + 4) / 6;
          break;
      }
    }

    return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <div className="space-y-6">
      {/* Platform Identity */}
      <div className="bg-card rounded-lg p-6 space-y-6">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <Building2 className="w-5 h-5 text-primary" />
          Identidade da Plataforma
        </div>

        {/* Platform Name */}
        <div className="space-y-2">
          <Label>Nome da Plataforma</Label>
          <Input
            value={platformName}
            onChange={(e) => setPlatformName(e.target.value)}
            placeholder="Nome exibido na plataforma"
          />
          <p className="text-sm text-muted-foreground">
            Este nome será exibido na barra lateral e em outros locais
          </p>
        </div>

        <Separator />

        {/* Logo Upload */}
        <div className="space-y-2">
          <Label>Logotipo</Label>
          <div className="flex items-center gap-4">
            {platformLogo ? (
              <div className="relative">
                <img
                  src={platformLogo}
                  alt="Logo"
                  className="h-16 w-16 object-contain rounded-lg border bg-background"
                />
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute -top-2 -right-2 h-6 w-6"
                  onClick={handleRemoveLogo}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <div className="h-16 w-16 rounded-lg border-2 border-dashed border-muted-foreground/25 flex items-center justify-center bg-muted/50">
                <Upload className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
            <div className="flex-1">
              <Input
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                disabled={isUploading}
                className="cursor-pointer"
              />
              <p className="text-xs text-muted-foreground mt-1">
                PNG, JPG ou SVG. Máximo 2MB.
              </p>
            </div>
          </div>
        </div>

        <Separator />

        {/* Colors */}
        <div className="space-y-4">
          <Label>Cores da Plataforma</Label>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Cor Primária</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-16 h-10 p-1 cursor-pointer"
                />
                <Input
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  placeholder="#3B82F6"
                  className="flex-1"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Cor Secundária</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="color"
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  className="w-16 h-10 p-1 cursor-pointer"
                />
                <Input
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  placeholder="#10B981"
                  className="flex-1"
                />
              </div>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            A cor primária é usada em botões e elementos de destaque. A cor secundária em elementos de apoio.
          </p>
        </div>

        <Button 
          onClick={handleSaveBranding} 
          disabled={isSaving || isUploading}
          className="w-full"
        >
          {isSaving ? "Salvando..." : "Salvar Identidade"}
        </Button>
      </div>

      {/* Appearance */}
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

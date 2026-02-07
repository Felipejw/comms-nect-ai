import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Upload, X, Loader2, Palette, RotateCcw } from "lucide-react";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useApplyBranding } from "@/hooks/useApplyBranding";

export const CustomizeTab = () => {
  const { settings, isLoading } = useSystemSettings();
  const { refreshBranding, applyBrandingColors, DEFAULT_BRANDING } = useApplyBranding();
  const queryClient = useQueryClient();
  
  // Basic
  const [platformName, setPlatformName] = useState("");
  const [platformLogo, setPlatformLogo] = useState("");
  
  // General colors
  const [primaryColor, setPrimaryColor] = useState("#3B82F6");
  const [secondaryColor, setSecondaryColor] = useState("#10B981");
  const [accentColor, setAccentColor] = useState("#8B5CF6");
  
  // Background and text
  const [backgroundColor, setBackgroundColor] = useState("#F8FAFC");
  const [foregroundColor, setForegroundColor] = useState("#1E293B");
  
  // Sidebar
  const [sidebarBgColor, setSidebarBgColor] = useState("#1E293B");
  const [sidebarFgColor, setSidebarFgColor] = useState("#F8FAFC");
  const [sidebarAccentColor, setSidebarAccentColor] = useState("#334155");
  
  // Cards and borders
  const [cardBgColor, setCardBgColor] = useState("#FFFFFF");
  const [borderColor, setBorderColor] = useState("#E2E8F0");

  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Helper function to find setting value
  const findSetting = (key: string, defaultValue: string): string => {
    const setting = settings.find(s => s.key === key);
    return setting?.value || defaultValue;
  };

  useEffect(() => {
    if (!isLoading && settings.length > 0) {
      setPlatformName(findSetting("platform_name", DEFAULT_BRANDING.platform_name));
      setPlatformLogo(findSetting("platform_logo_url", ""));
      setPrimaryColor(findSetting("primary_color", DEFAULT_BRANDING.primary_color));
      setSecondaryColor(findSetting("secondary_color", DEFAULT_BRANDING.secondary_color));
      setAccentColor(findSetting("accent_color", DEFAULT_BRANDING.accent_color));
      setBackgroundColor(findSetting("background_color", DEFAULT_BRANDING.background_color));
      setForegroundColor(findSetting("foreground_color", DEFAULT_BRANDING.foreground_color));
      setSidebarBgColor(findSetting("sidebar_background_color", DEFAULT_BRANDING.sidebar_background_color));
      setSidebarFgColor(findSetting("sidebar_foreground_color", DEFAULT_BRANDING.sidebar_foreground_color));
      setSidebarAccentColor(findSetting("sidebar_accent_color", DEFAULT_BRANDING.sidebar_accent_color));
      setCardBgColor(findSetting("card_background_color", DEFAULT_BRANDING.card_background_color));
      setBorderColor(findSetting("border_color", DEFAULT_BRANDING.border_color));
    }
  }, [isLoading, settings]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Por favor, selecione um arquivo de imagem");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error("A imagem deve ter no máximo 2MB");
      return;
    }

    setIsUploading(true);
    try {
      const fileName = `logo-${Date.now()}.${file.name.split(".").pop()}`;
      
      const { error: uploadError } = await supabase.storage
        .from("platform-assets")
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("platform-assets")
        .getPublicUrl(fileName);

      const publicUrl = urlData.publicUrl;
      setPlatformLogo(publicUrl);

      const { error: saveError } = await supabase
        .from("system_settings")
        .upsert({
          key: "platform_logo_url",
          value: publicUrl,
          description: "URL do logotipo da plataforma",
          category: "branding",
        }, { onConflict: "key" });

      if (saveError) throw saveError;

      await queryClient.invalidateQueries({ queryKey: ["system-settings"] });
      await queryClient.invalidateQueries({ queryKey: ["branding-settings"] });
      toast.success("Logo enviado e salvo com sucesso!");
    } catch (error) {
      console.error("Error uploading logo:", error);
      toast.error("Erro ao fazer upload do logo");
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveLogo = async () => {
    try {
      setPlatformLogo("");
      
      const { error } = await supabase
        .from("system_settings")
        .upsert({
          key: "platform_logo_url",
          value: "",
          description: "URL do logotipo da plataforma",
          category: "branding",
        }, { onConflict: "key" });

      if (error) throw error;

      await queryClient.invalidateQueries({ queryKey: ["system-settings"] });
      await queryClient.invalidateQueries({ queryKey: ["branding-settings"] });
      toast.success("Logo removido com sucesso!");
    } catch (error) {
      console.error("Error removing logo:", error);
      toast.error("Erro ao remover logo");
    }
  };

  const handleSaveBranding = async () => {
    setIsSaving(true);
    try {
      const updates = [
        { key: "platform_name", value: platformName, description: "Nome da plataforma", category: "branding" },
        { key: "primary_color", value: primaryColor, description: "Cor primária", category: "branding" },
        { key: "secondary_color", value: secondaryColor, description: "Cor secundária", category: "branding" },
        { key: "accent_color", value: accentColor, description: "Cor de acento", category: "branding" },
        { key: "background_color", value: backgroundColor, description: "Cor de fundo da aplicação", category: "branding" },
        { key: "foreground_color", value: foregroundColor, description: "Cor do texto principal", category: "branding" },
        { key: "sidebar_background_color", value: sidebarBgColor, description: "Cor de fundo da sidebar", category: "branding" },
        { key: "sidebar_foreground_color", value: sidebarFgColor, description: "Cor do texto da sidebar", category: "branding" },
        { key: "sidebar_accent_color", value: sidebarAccentColor, description: "Cor de destaque da sidebar", category: "branding" },
        { key: "card_background_color", value: cardBgColor, description: "Cor de fundo dos cards", category: "branding" },
        { key: "border_color", value: borderColor, description: "Cor das bordas", category: "branding" },
      ];

      for (const update of updates) {
        const { error } = await supabase
          .from("system_settings")
          .upsert(update, { onConflict: "key" });
        
        if (error) throw error;
      }

      await queryClient.invalidateQueries({ queryKey: ["system-settings"] });
      await queryClient.invalidateQueries({ queryKey: ["branding-settings"] });
      
      // Apply colors immediately
      applyBrandingColors({
        primary_color: primaryColor,
        secondary_color: secondaryColor,
        accent_color: accentColor,
        background_color: backgroundColor,
        foreground_color: foregroundColor,
        sidebar_background_color: sidebarBgColor,
        sidebar_foreground_color: sidebarFgColor,
        sidebar_accent_color: sidebarAccentColor,
        card_background_color: cardBgColor,
        border_color: borderColor,
      });
      
      refreshBranding();
      toast.success("Identidade da plataforma salva com sucesso!");
    } catch (error: any) {
      console.error("Branding save error:", JSON.stringify(error, null, 2));
      const errorMsg = error?.message || error?.toString() || 'Erro desconhecido';
      toast.error(`Erro ao salvar configurações: ${errorMsg}`);
    } finally {
      setIsSaving(false);
    }
  };

  const ColorInput = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
    <div className="space-y-2">
      <Label className="text-sm">{label}</Label>
      <div className="flex gap-2">
        <Input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-10 h-9 p-1 cursor-pointer shrink-0"
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 font-mono text-xs"
        />
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Identidade Visual
          </CardTitle>
          <CardDescription>
            Personalize o nome, logo e cores da sua plataforma
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Platform Name */}
          <div className="space-y-2">
            <Label htmlFor="platform-name">Nome da Plataforma</Label>
            <Input
              id="platform-name"
              value={platformName}
              onChange={(e) => setPlatformName(e.target.value)}
              placeholder="Nome da sua plataforma"
            />
          </div>

          {/* Logo Upload */}
          <div className="space-y-2">
            <Label>Logotipo</Label>
            <div className="flex items-center gap-4">
              {platformLogo ? (
                <div className="relative">
                  <img
                    src={platformLogo}
                    alt="Logo"
                    className="h-16 w-16 object-contain rounded border"
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
                <div className="h-16 w-16 border-2 border-dashed rounded flex items-center justify-center text-muted-foreground">
                  <Upload className="h-6 w-6" />
                </div>
              )}
              <div>
                <Input
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  disabled={isUploading}
                  className="hidden"
                  id="logo-upload"
                />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isUploading}
                  onClick={() => document.getElementById("logo-upload")?.click()}
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      Enviar Logo
                    </>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground mt-1">
                  PNG, JPG ou SVG. Máximo 2MB.
                </p>
              </div>
            </div>
          </div>

          {/* Color Sections */}
          <div className="space-y-6">
            {/* General Colors */}
            <div className="space-y-4">
              <h4 className="font-medium text-sm border-b pb-2">Cores Gerais</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <ColorInput label="Cor Primária" value={primaryColor} onChange={setPrimaryColor} />
                <ColorInput label="Cor Secundária" value={secondaryColor} onChange={setSecondaryColor} />
                <ColorInput label="Cor de Acento" value={accentColor} onChange={setAccentColor} />
              </div>
            </div>

            {/* Background and Text */}
            <div className="space-y-4">
              <h4 className="font-medium text-sm border-b pb-2">Fundo e Texto</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ColorInput label="Fundo da Aplicação" value={backgroundColor} onChange={setBackgroundColor} />
                <ColorInput label="Cor do Texto" value={foregroundColor} onChange={setForegroundColor} />
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-4">
              <h4 className="font-medium text-sm border-b pb-2">Barra Lateral</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <ColorInput label="Fundo da Sidebar" value={sidebarBgColor} onChange={setSidebarBgColor} />
                <ColorInput label="Texto da Sidebar" value={sidebarFgColor} onChange={setSidebarFgColor} />
                <ColorInput label="Item Ativo" value={sidebarAccentColor} onChange={setSidebarAccentColor} />
              </div>
            </div>

            {/* Cards and Borders */}
            <div className="space-y-4">
              <h4 className="font-medium text-sm border-b pb-2">Cards e Elementos</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ColorInput label="Fundo dos Cards" value={cardBgColor} onChange={setCardBgColor} />
                <ColorInput label="Cor das Bordas" value={borderColor} onChange={setBorderColor} />
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="p-4 border rounded-lg bg-muted/50">
            <p className="text-sm text-muted-foreground mb-3">Prévia:</p>
            <div className="flex flex-wrap items-center gap-3">
              {platformLogo && (
                <img src={platformLogo} alt="Preview" className="h-8 w-8 object-contain" />
              )}
              <span className="font-semibold">{platformName || "Nome da Plataforma"}</span>
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-5 rounded" style={{ backgroundColor: primaryColor }} />
                <span className="text-xs text-muted-foreground">Primária</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-5 rounded" style={{ backgroundColor: secondaryColor }} />
                <span className="text-xs text-muted-foreground">Secundária</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-5 rounded" style={{ backgroundColor: accentColor }} />
                <span className="text-xs text-muted-foreground">Acento</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-5 rounded border" style={{ backgroundColor: backgroundColor }} />
                <span className="text-xs text-muted-foreground">Fundo</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-5 rounded" style={{ backgroundColor: sidebarBgColor }} />
                <span className="text-xs text-muted-foreground">Sidebar</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <Button 
              variant="outline" 
              onClick={() => {
                setPrimaryColor(DEFAULT_BRANDING.primary_color);
                setSecondaryColor(DEFAULT_BRANDING.secondary_color);
                setAccentColor(DEFAULT_BRANDING.accent_color);
                setBackgroundColor(DEFAULT_BRANDING.background_color);
                setForegroundColor(DEFAULT_BRANDING.foreground_color);
                setSidebarBgColor(DEFAULT_BRANDING.sidebar_background_color);
                setSidebarFgColor(DEFAULT_BRANDING.sidebar_foreground_color);
                setSidebarAccentColor(DEFAULT_BRANDING.sidebar_accent_color);
                setCardBgColor(DEFAULT_BRANDING.card_background_color);
                setBorderColor(DEFAULT_BRANDING.border_color);
              }}
              className="gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              Restaurar Cores Padrão
            </Button>
            <Button onClick={handleSaveBranding} disabled={isSaving} className="flex-1 sm:flex-none">
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                "Salvar Identidade Visual"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

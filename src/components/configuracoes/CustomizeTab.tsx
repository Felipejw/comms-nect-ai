import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Upload, X, Loader2, Palette } from "lucide-react";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export const CustomizeTab = () => {
  const { getSetting, isLoading } = useSystemSettings();
  const queryClient = useQueryClient();
  
  const [platformName, setPlatformName] = useState("");
  const [platformLogo, setPlatformLogo] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#8B5CF6");
  const [secondaryColor, setSecondaryColor] = useState("#D946EF");
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setPlatformName(getSetting("platform_name") || "ZapMaster");
      setPlatformLogo(getSetting("platform_logo") || "");
      setPrimaryColor(getSetting("primary_color") || "#8B5CF6");
      setSecondaryColor(getSetting("secondary_color") || "#D946EF");
    }
  }, [isLoading, getSetting]);

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

      // Save logo URL to database immediately
      const { error: saveError } = await supabase
        .from("system_settings")
        .upsert({
          key: "platform_logo",
          value: publicUrl,
          description: "URL do logotipo da plataforma",
          category: "branding",
        }, { onConflict: "key" });

      if (saveError) throw saveError;

      await queryClient.invalidateQueries({ queryKey: ["system-settings"] });
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
          key: "platform_logo",
          value: "",
          description: "URL do logotipo da plataforma",
          category: "branding",
        }, { onConflict: "key" });

      if (error) throw error;

      await queryClient.invalidateQueries({ queryKey: ["system-settings"] });
      toast.success("Logo removido com sucesso!");
    } catch (error) {
      console.error("Error removing logo:", error);
      toast.error("Erro ao remover logo");
    }
  };

  const hexToHsl = (hex: string): string => {
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
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }

    return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
  };

  const applyColors = (primary: string, secondary: string) => {
    const root = document.documentElement;
    root.style.setProperty("--primary", hexToHsl(primary));
    root.style.setProperty("--secondary", hexToHsl(secondary));
  };

  const handleSaveBranding = async () => {
    setIsSaving(true);
    try {
      const updates = [
        { key: "platform_name", value: platformName, description: "Nome da plataforma", category: "branding" },
        { key: "primary_color", value: primaryColor, description: "Cor primária da plataforma", category: "branding" },
        { key: "secondary_color", value: secondaryColor, description: "Cor secundária da plataforma", category: "branding" },
      ];

      for (const update of updates) {
        const { error } = await supabase
          .from("system_settings")
          .upsert(update, { onConflict: "key" });
        
        if (error) throw error;
      }

      await queryClient.invalidateQueries({ queryKey: ["system-settings"] });
      applyColors(primaryColor, secondaryColor);
      toast.success("Identidade da plataforma salva com sucesso!");
    } catch (error) {
      console.error("Error saving branding:", error);
      toast.error("Erro ao salvar configurações");
    } finally {
      setIsSaving(false);
    }
  };

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

          {/* Colors */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="primary-color">Cor Primária</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  id="primary-color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-12 h-10 p-1 cursor-pointer"
                />
                <Input
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  placeholder="#8B5CF6"
                  className="flex-1"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="secondary-color">Cor Secundária</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  id="secondary-color"
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  className="w-12 h-10 p-1 cursor-pointer"
                />
                <Input
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  placeholder="#D946EF"
                  className="flex-1"
                />
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="p-4 border rounded-lg bg-muted/50">
            <p className="text-sm text-muted-foreground mb-2">Prévia:</p>
            <div className="flex items-center gap-3">
              {platformLogo && (
                <img src={platformLogo} alt="Preview" className="h-8 w-8 object-contain" />
              )}
              <span className="font-semibold">{platformName || "Nome da Plataforma"}</span>
              <div
                className="w-6 h-6 rounded"
                style={{ backgroundColor: primaryColor }}
                title="Cor primária"
              />
              <div
                className="w-6 h-6 rounded"
                style={{ backgroundColor: secondaryColor }}
                title="Cor secundária"
              />
            </div>
          </div>

          <Button onClick={handleSaveBranding} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              "Salvar Identidade"
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

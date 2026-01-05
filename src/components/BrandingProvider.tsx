import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface BrandingSettings {
  primary_color?: string;
  secondary_color?: string;
  background_color?: string;
  foreground_color?: string;
  accent_color?: string;
  sidebar_background_color?: string;
  sidebar_foreground_color?: string;
  sidebar_accent_color?: string;
  card_background_color?: string;
  border_color?: string;
}

function hexToHsl(hex: string): string {
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
}

function applyColors(settings: BrandingSettings) {
  const root = document.documentElement;

  if (settings.primary_color) {
    root.style.setProperty("--primary", hexToHsl(settings.primary_color));
  }
  if (settings.secondary_color) {
    root.style.setProperty("--secondary", hexToHsl(settings.secondary_color));
  }
  if (settings.background_color) {
    root.style.setProperty("--background", hexToHsl(settings.background_color));
  }
  if (settings.foreground_color) {
    root.style.setProperty("--foreground", hexToHsl(settings.foreground_color));
  }
  if (settings.accent_color) {
    root.style.setProperty("--accent", hexToHsl(settings.accent_color));
  }
  if (settings.sidebar_background_color) {
    root.style.setProperty("--sidebar-background", hexToHsl(settings.sidebar_background_color));
  }
  if (settings.sidebar_foreground_color) {
    root.style.setProperty("--sidebar-foreground", hexToHsl(settings.sidebar_foreground_color));
  }
  if (settings.sidebar_accent_color) {
    root.style.setProperty("--sidebar-accent", hexToHsl(settings.sidebar_accent_color));
  }
  if (settings.card_background_color) {
    root.style.setProperty("--card", hexToHsl(settings.card_background_color));
  }
  if (settings.border_color) {
    root.style.setProperty("--border", hexToHsl(settings.border_color));
  }
}

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const { data: settings } = useQuery({
    queryKey: ["branding-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_settings")
        .select("key, value")
        .in("key", [
          "primary_color",
          "secondary_color",
          "background_color",
          "foreground_color",
          "accent_color",
          "sidebar_background_color",
          "sidebar_foreground_color",
          "sidebar_accent_color",
          "card_background_color",
          "border_color",
        ]);

      if (error) throw error;

      const settingsMap: BrandingSettings = {};
      data?.forEach((item) => {
        settingsMap[item.key as keyof BrandingSettings] = item.value;
      });

      return settingsMap;
    },
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    if (settings) {
      applyColors(settings);
    }
  }, [settings]);

  return <>{children}</>;
}

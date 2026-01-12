import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useUpdateProfile } from "@/hooks/useUsers";
import { supabase } from "@/integrations/supabase/client";
import { User, Lock, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

export function ProfileTab() {
  const { user, profile } = useAuth();
  const updateProfile = useUpdateProfile();

  const [profileData, setProfileData] = useState({
    name: profile?.name || "",
    phone: profile?.phone || "",
  });
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [emailData, setEmailData] = useState({
    newEmail: "",
  });
  const [isChangingEmail, setIsChangingEmail] = useState(false);

  const [passwordData, setPasswordData] = useState({
    newPassword: "",
    confirmPassword: "",
  });
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const handleSaveProfile = async () => {
    if (!user) return;

    setIsSavingProfile(true);
    try {
      await updateProfile.mutateAsync({
        userId: user.id,
        name: profileData.name,
        phone: profileData.phone,
      });
      toast.success("Perfil atualizado com sucesso!");
    } catch (error) {
      toast.error("Erro ao atualizar perfil");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleChangeEmail = async () => {
    if (!emailData.newEmail) {
      toast.error("Digite o novo email");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailData.newEmail)) {
      toast.error("Digite um email válido");
      return;
    }

    if (emailData.newEmail === user?.email) {
      toast.error("O novo email deve ser diferente do atual");
      return;
    }

    setIsChangingEmail(true);
    try {
      const { error } = await supabase.auth.updateUser({
        email: emailData.newEmail,
      });

      if (error) throw error;

      toast.success("Email de confirmação enviado! Verifique sua caixa de entrada.");
      setEmailData({ newEmail: "" });
    } catch (error: any) {
      toast.error(error.message || "Erro ao alterar email");
    } finally {
      setIsChangingEmail(false);
    }
  };

  const handleChangePassword = async () => {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error("As senhas não coincidem");
      return;
    }

    if (passwordData.newPassword.length < 6) {
      toast.error("A senha deve ter no mínimo 6 caracteres");
      return;
    }

    setIsChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: passwordData.newPassword,
      });

      if (error) throw error;

      toast.success("Senha alterada com sucesso!");
      setPasswordData({ newPassword: "", confirmPassword: "" });
    } catch (error: any) {
      toast.error(error.message || "Erro ao alterar senha");
    } finally {
      setIsChangingPassword(false);
    }
  };

  const getInitials = (name?: string) => {
    if (!name) return "?";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  };

  return (
    <div className="space-y-6">
      {/* Profile Info */}
      <div className="bg-card rounded-lg p-6 space-y-6">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <User className="w-5 h-5 text-primary" />
          Informações do Perfil
        </div>

        <div className="flex items-center gap-4">
          <Avatar className="w-20 h-20">
            <AvatarImage src={profile?.avatar_url || undefined} />
            <AvatarFallback className="text-xl bg-primary/10 text-primary">
              {getInitials(profile?.name)}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium text-lg">{profile?.name || "Sem nome"}</p>
            <p className="text-sm text-muted-foreground">{profile?.email}</p>
          </div>
        </div>

        <Separator />

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Nome</Label>
            <Input
              value={profileData.name}
              onChange={(e) =>
                setProfileData((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder="Seu nome"
            />
          </div>
          <div className="space-y-2">
            <Label>Email atual</Label>
            <Input value={profile?.email || ""} disabled className="bg-muted" />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Telefone</Label>
            <Input
              value={profileData.phone}
              onChange={(e) =>
                setProfileData((prev) => ({ ...prev, phone: e.target.value }))
              }
              placeholder="+55 (11) 99999-9999"
            />
          </div>
        </div>

        <Button onClick={handleSaveProfile} disabled={isSavingProfile}>
          {isSavingProfile ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Salvando...
            </>
          ) : (
            "Salvar Alterações"
          )}
        </Button>
      </div>

      {/* Change Email */}
      <div className="bg-card rounded-lg p-6 space-y-6">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <Mail className="w-5 h-5 text-primary" />
          Alterar Email
        </div>

        <p className="text-sm text-muted-foreground">
          Após a alteração, você receberá um email de confirmação no novo endereço.
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Novo Email</Label>
            <Input
              type="email"
              value={emailData.newEmail}
              onChange={(e) =>
                setEmailData({ newEmail: e.target.value })
              }
              placeholder="novo@email.com"
            />
          </div>
        </div>

        <Button
          onClick={handleChangeEmail}
          disabled={isChangingEmail || !emailData.newEmail}
          variant="secondary"
        >
          {isChangingEmail ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Alterando...
            </>
          ) : (
            "Alterar Email"
          )}
        </Button>
      </div>

      {/* Password */}
      <div className="bg-card rounded-lg p-6 space-y-6">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <Lock className="w-5 h-5 text-primary" />
          Alterar Senha
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Nova Senha</Label>
            <Input
              type="password"
              value={passwordData.newPassword}
              onChange={(e) =>
                setPasswordData((prev) => ({
                  ...prev,
                  newPassword: e.target.value,
                }))
              }
              placeholder="••••••••"
            />
          </div>
          <div className="space-y-2">
            <Label>Confirmar Nova Senha</Label>
            <Input
              type="password"
              value={passwordData.confirmPassword}
              onChange={(e) =>
                setPasswordData((prev) => ({
                  ...prev,
                  confirmPassword: e.target.value,
                }))
              }
              placeholder="••••••••"
            />
          </div>
        </div>

        <Button
          onClick={handleChangePassword}
          disabled={isChangingPassword || !passwordData.newPassword}
          variant="secondary"
        >
          {isChangingPassword ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Alterando...
            </>
          ) : (
            "Alterar Senha"
          )}
        </Button>
      </div>
    </div>
  );
}

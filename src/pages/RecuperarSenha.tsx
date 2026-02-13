import { useState } from "react";
import { Link } from "react-router-dom";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { MessageSquare, Mail, Loader2, ArrowLeft, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const schema = z.object({
  email: z.string().trim().email({ message: "E-mail inválido" }).max(255),
});

type FormData = z.infer<typeof schema>;

export default function RecuperarSenha() {
  const { getSetting } = useSystemSettings();
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const platformName = getSetting("platform_name") || "TalkFlow";
  const platformLogo = getSetting("platform_logo");

  const form = useForm<FormData>({ resolver: zodResolver(schema), defaultValues: { email: "" } });

  const handleSubmit = async (data: FormData) => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
        redirectTo: `${window.location.origin}/login`,
      });
      if (error) {
        toast.error(error.message);
      } else {
        setEmailSent(true);
      }
    } catch (error: any) {
      toast.error("Erro ao enviar e-mail: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-background">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-8">
            {platformLogo ? (
              <img src={platformLogo} alt={platformName} className="w-10 h-10 rounded-lg object-contain" />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
                <MessageSquare className="w-6 h-6 text-primary-foreground" />
              </div>
            )}
            <span className="font-bold text-xl">{platformName}</span>
          </div>

          {emailSent ? (
            <div className="space-y-4">
              <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-2xl font-bold">E-mail enviado!</h2>
              <p className="text-muted-foreground">
                Se o e-mail estiver cadastrado, você receberá um link para redefinir sua senha.
                Verifique sua caixa de entrada e spam.
              </p>
              <Link to="/login">
                <Button variant="outline" className="gap-2 mt-4">
                  <ArrowLeft className="w-4 h-4" />
                  Voltar ao login
                </Button>
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-2xl font-bold">Recuperar senha</h2>
              <p className="text-muted-foreground mt-2">
                Informe seu e-mail para receber um link de redefinição de senha
              </p>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 mt-6 text-left">
                  <FormField control={form.control} name="email" render={({ field }) => (
                    <FormItem>
                      <FormLabel>E-mail</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input {...field} type="email" placeholder="seu@email.com" className="pl-9" disabled={isLoading} />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Enviando...</>) : "Enviar link de recuperação"}
                  </Button>
                </form>
              </Form>

              <Link to="/login" className="inline-flex items-center gap-2 text-sm text-primary hover:underline mt-4">
                <ArrowLeft className="w-4 h-4" />
                Voltar ao login
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { MessageSquare, Mail, Lock, Loader2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const loginSchema = z.object({
  email: z.string().trim().email({ message: "E-mail inválido" }).max(255),
  password: z.string().min(6, { message: "Senha deve ter no mínimo 6 caracteres" }).max(100),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function Login() {
  const navigate = useNavigate();
  const { user, loading: authLoading, signIn } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const loginForm = useForm<LoginFormData>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });

  useEffect(() => {
    if (!authLoading && user) {
      navigate("/dashboard");
    }
  }, [user, authLoading, navigate]);

  const handleLogin = async (data: LoginFormData) => {
    setIsLoading(true);
    try {
      const { error } = await signIn(data.email, data.password);
      if (error) {
        if (error.message.includes("Invalid login")) { toast.error("E-mail ou senha incorretos"); } else { toast.error(error.message); }
      } else { toast.success("Login realizado com sucesso!"); }
    } catch (error: any) { toast.error("Erro ao fazer login: " + error.message); } finally { setIsLoading(false); }
  };

  if (authLoading) {
    return (<div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>);
  }

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 bg-sidebar flex-col justify-between p-12">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center"><MessageSquare className="w-6 h-6 text-primary-foreground" /></div>
          <span className="font-bold text-xl text-sidebar-foreground">TalkFlow</span>
        </div>
        <div className="space-y-6">
          <h1 className="text-4xl font-bold text-sidebar-foreground leading-tight">Gerencie todas as suas conversas em um só lugar</h1>
          <p className="text-lg text-sidebar-muted">Plataforma completa de atendimento, campanhas e automação com inteligência artificial.</p>
        </div>
        <p className="text-sm text-sidebar-muted">© 2024 TalkFlow. Todos os direitos reservados.</p>
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center lg:text-left">
            <div className="lg:hidden flex items-center justify-center gap-2 mb-8">
              <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center"><MessageSquare className="w-6 h-6 text-primary-foreground" /></div>
              <span className="font-bold text-xl">TalkFlow</span>
            </div>
            <h2 className="text-2xl font-bold">Bem-vindo ao TalkFlow</h2>
            <p className="text-muted-foreground mt-2">Entre com suas credenciais para acessar o painel</p>
          </div>

          <Form {...loginForm}>
            <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4">
              <FormField control={loginForm.control} name="email" render={({ field }) => (
                <FormItem><FormLabel>E-mail</FormLabel><FormControl><div className="relative"><Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input {...field} type="email" placeholder="seu@email.com" className="pl-9" disabled={isLoading} /></div></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={loginForm.control} name="password" render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between"><FormLabel>Senha</FormLabel><Link to="/recuperar-senha" className="text-sm text-primary hover:underline">Esqueceu a senha?</Link></div>
                  <FormControl><div className="relative"><Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input {...field} type={showPassword ? "text" : "password"} placeholder="••••••" className="pl-9 pr-9" disabled={isLoading} /><button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">{showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button></div></FormControl><FormMessage />
                </FormItem>
              )} />
              <Button type="submit" className="w-full" disabled={isLoading}>{isLoading ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Entrando...</>) : "Entrar"}</Button>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}

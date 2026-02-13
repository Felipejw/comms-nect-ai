import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/contexts/AuthContext";
import { BrandingProvider } from "@/components/BrandingProvider";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Loader2 } from "lucide-react";

// Eager-loaded routes (critical path)
import Index from "./pages/Index";
import Login from "./pages/Login";

// Lazy-loaded routes
const AcessoNegado = lazy(() => import("./pages/AcessoNegado"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Atendimento = lazy(() => import("./pages/Atendimento"));
const Kanban = lazy(() => import("./pages/Kanban"));
const Contatos = lazy(() => import("./pages/Contatos"));
const Tags = lazy(() => import("./pages/Tags"));
const RespostasRapidas = lazy(() => import("./pages/RespostasRapidas"));
const Agendamentos = lazy(() => import("./pages/Agendamentos"));
const ChatInterno = lazy(() => import("./pages/ChatInterno"));
const Campanhas = lazy(() => import("./pages/Campanhas"));
const Chatbot = lazy(() => import("./pages/Chatbot"));
const Usuarios = lazy(() => import("./pages/Usuarios"));
const FilasChatbot = lazy(() => import("./pages/FilasChatbot"));
const Integracoes = lazy(() => import("./pages/Integracoes"));
const Conexoes = lazy(() => import("./pages/Conexoes"));
const Relatorios = lazy(() => import("./pages/Relatorios"));
const Painel = lazy(() => import("./pages/Painel"));
const Configuracoes = lazy(() => import("./pages/Configuracoes"));
const Diagnostico = lazy(() => import("./pages/Diagnostico"));
const ApiDocs = lazy(() => import("./pages/ApiDocs"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 30000,
      refetchOnWindowFocus: false,
    },
  },
});

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <Loader2 className="w-8 h-8 animate-spin text-primary" />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <AuthProvider>
        <BrandingProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
          <BrowserRouter>
            <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/login" element={<Login />} />
              <Route path="/acesso-negado" element={<AcessoNegado />} />
              
              {/* App Routes with Layout */}
              <Route element={<AppLayout />}>
                <Route path="/dashboard" element={<ProtectedRoute module="dashboard"><Dashboard /></ProtectedRoute>} />
                <Route path="/relatorios" element={<ProtectedRoute module="relatorios"><Relatorios /></ProtectedRoute>} />
                <Route path="/painel" element={<ProtectedRoute module="painel"><Painel /></ProtectedRoute>} />
                <Route path="/atendimento" element={<ProtectedRoute module="atendimento"><Atendimento /></ProtectedRoute>} />
                <Route path="/respostas-rapidas" element={<ProtectedRoute module="respostas_rapidas"><RespostasRapidas /></ProtectedRoute>} />
                <Route path="/kanban" element={<ProtectedRoute module="kanban"><Kanban /></ProtectedRoute>} />
                <Route path="/contatos" element={<ProtectedRoute module="contatos"><Contatos /></ProtectedRoute>} />
                <Route path="/agendamentos" element={<ProtectedRoute module="agendamentos"><Agendamentos /></ProtectedRoute>} />
                <Route path="/tags" element={<ProtectedRoute module="tags"><Tags /></ProtectedRoute>} />
                <Route path="/chat-interno" element={<ProtectedRoute module="chat_interno"><ChatInterno /></ProtectedRoute>} />
                <Route path="/campanhas" element={<ProtectedRoute module="campanhas"><Campanhas /></ProtectedRoute>} />
                <Route path="/chatbot" element={<ProtectedRoute module="chatbot"><Chatbot /></ProtectedRoute>} />
                <Route path="/usuarios" element={<ProtectedRoute module="usuarios"><Usuarios /></ProtectedRoute>} />
                <Route path="/filas-chatbot" element={<ProtectedRoute module="setores"><FilasChatbot /></ProtectedRoute>} />
                <Route path="/integracoes" element={<ProtectedRoute module="integracoes"><Integracoes /></ProtectedRoute>} />
                <Route path="/conexoes" element={<ProtectedRoute module="conexoes"><Conexoes /></ProtectedRoute>} />
                <Route path="/diagnostico" element={<ProtectedRoute module="conexoes"><Diagnostico /></ProtectedRoute>} />
                <Route path="/configuracoes" element={<ProtectedRoute><Configuracoes /></ProtectedRoute>} />
                <Route path="/api-docs" element={<ProtectedRoute><ApiDocs /></ProtectedRoute>} />
              </Route>
              
              <Route path="*" element={<NotFound />} />
            </Routes>
            </Suspense>
          </BrowserRouter>
          </TooltipProvider>
        </BrandingProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;

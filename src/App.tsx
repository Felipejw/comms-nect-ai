import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { BrandingProvider } from "@/components/BrandingProvider";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { SuperAdminRoute } from "@/components/auth/SuperAdminRoute";
import Index from "./pages/Index";
import Login from "./pages/Login";
import AcessoNegado from "./pages/AcessoNegado";
import Dashboard from "./pages/Dashboard";
import Atendimento from "./pages/Atendimento";
import Kanban from "./pages/Kanban";
import Contatos from "./pages/Contatos";
import Tags from "./pages/Tags";
import RespostasRapidas from "./pages/RespostasRapidas";
import Agendamentos from "./pages/Agendamentos";
import ChatInterno from "./pages/ChatInterno";
import Campanhas from "./pages/Campanhas";
import Chatbot from "./pages/Chatbot";
import Usuarios from "./pages/Usuarios";
import FilasChatbot from "./pages/FilasChatbot";
import Integracoes from "./pages/Integracoes";
import Conexoes from "./pages/Conexoes";
import Relatorios from "./pages/Relatorios";
import Painel from "./pages/Painel";
import Configuracoes from "./pages/Configuracoes";
import Diagnostico from "./pages/Diagnostico";
import SuperAdmin from "./pages/SuperAdmin";
import Onboarding from "./pages/Onboarding";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <BrandingProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/login" element={<Login />} />
              <Route path="/acesso-negado" element={<AcessoNegado />} />
              <Route path="/onboarding" element={<Onboarding />} />
              
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
                <Route path="/super-admin" element={<SuperAdminRoute><SuperAdmin /></SuperAdminRoute>} />
              </Route>
              
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </BrandingProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;

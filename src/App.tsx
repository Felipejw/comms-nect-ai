import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/layout/AppLayout";
import Index from "./pages/Index";
import Login from "./pages/Login";
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
import TalkAI from "./pages/TalkAI";
import Integracoes from "./pages/Integracoes";
import Conexoes from "./pages/Conexoes";
import Relatorios from "./pages/Relatorios";
import Painel from "./pages/Painel";
import Configuracoes from "./pages/Configuracoes";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            
            {/* App Routes with Layout */}
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/relatorios" element={<Relatorios />} />
              <Route path="/painel" element={<Painel />} />
              <Route path="/atendimento" element={<Atendimento />} />
              <Route path="/respostas-rapidas" element={<RespostasRapidas />} />
              <Route path="/kanban" element={<Kanban />} />
              <Route path="/contatos" element={<Contatos />} />
              <Route path="/agendamentos" element={<Agendamentos />} />
              <Route path="/tags" element={<Tags />} />
              <Route path="/chat-interno" element={<ChatInterno />} />
              <Route path="/campanhas" element={<Campanhas />} />
              <Route path="/chatbot" element={<Chatbot />} />
              <Route path="/usuarios" element={<Usuarios />} />
              <Route path="/filas-chatbot" element={<FilasChatbot />} />
              <Route path="/talk-ai" element={<TalkAI />} />
              <Route path="/integracoes" element={<Integracoes />} />
              <Route path="/conexoes" element={<Conexoes />} />
              <Route path="/configuracoes" element={<Configuracoes />} />
            </Route>
            
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;

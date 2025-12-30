import { Copy, ExternalLink, Code, Lock, Key } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

const endpoints = [
  {
    method: "GET",
    path: "/api/contacts",
    description: "Lista todos os contatos",
    auth: true,
  },
  {
    method: "POST",
    path: "/api/contacts",
    description: "Cria um novo contato",
    auth: true,
  },
  {
    method: "GET",
    path: "/api/conversations",
    description: "Lista conversas ativas",
    auth: true,
  },
  {
    method: "POST",
    path: "/api/messages",
    description: "Envia uma mensagem",
    auth: true,
  },
  {
    method: "GET",
    path: "/api/campaigns",
    description: "Lista campanhas",
    auth: true,
  },
  {
    method: "POST",
    path: "/api/webhooks",
    description: "Configura webhooks",
    auth: true,
  },
];

const methodColors = {
  GET: "bg-success/10 text-success",
  POST: "bg-primary/10 text-primary",
  PUT: "bg-warning/10 text-warning",
  DELETE: "bg-destructive/10 text-destructive",
};

export default function API() {
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copiado!");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Code className="w-7 h-7" />
            API Interna
          </h2>
          <p className="text-muted-foreground">Documentação dos endpoints internos do sistema</p>
        </div>
      </div>

      <Tabs defaultValue="endpoints" className="space-y-6">
        <TabsList>
          <TabsTrigger value="endpoints">Endpoints</TabsTrigger>
          <TabsTrigger value="auth">Autenticação</TabsTrigger>
          <TabsTrigger value="examples">Exemplos</TabsTrigger>
        </TabsList>

        <TabsContent value="endpoints" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Endpoints Disponíveis</CardTitle>
              <CardDescription>
                Lista de todos os endpoints da API interna
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {endpoints.map((endpoint, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <Badge className={methodColors[endpoint.method as keyof typeof methodColors]}>
                        {endpoint.method}
                      </Badge>
                      <code className="text-sm font-mono">{endpoint.path}</code>
                      <span className="text-sm text-muted-foreground">{endpoint.description}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {endpoint.auth && (
                        <Badge variant="outline" className="gap-1">
                          <Lock className="w-3 h-3" />
                          Auth
                        </Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => copyToClipboard(endpoint.path)}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="auth" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="w-5 h-5" />
                Chave de API
              </CardTitle>
              <CardDescription>
                Use esta chave para autenticar suas requisições
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  type="password"
                  value="sk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  readOnly
                  className="font-mono"
                />
                <Button variant="outline" onClick={() => copyToClipboard("sk_live_xxxxxxxx")}>
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
              <div className="bg-muted rounded-lg p-4">
                <p className="text-sm font-medium mb-2">Como usar:</p>
                <code className="text-sm text-muted-foreground">
                  Authorization: Bearer sk_live_xxxxxxxx
                </code>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="examples" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Exemplos de Uso</CardTitle>
              <CardDescription>
                Exemplos de requisições para a API
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h4 className="font-medium mb-2">Listar Contatos</h4>
                <div className="bg-sidebar text-sidebar-foreground rounded-lg p-4 font-mono text-sm overflow-x-auto">
                  <pre>{`curl -X GET "https://api.talkflow.com/api/contacts" \\
  -H "Authorization: Bearer sk_live_xxxxxxxx" \\
  -H "Content-Type: application/json"`}</pre>
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-2">Enviar Mensagem</h4>
                <div className="bg-sidebar text-sidebar-foreground rounded-lg p-4 font-mono text-sm overflow-x-auto">
                  <pre>{`curl -X POST "https://api.talkflow.com/api/messages" \\
  -H "Authorization: Bearer sk_live_xxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "contact_id": "12345",
    "message": "Olá! Como posso ajudar?"
  }'`}</pre>
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-2">Resposta de Exemplo</h4>
                <div className="bg-sidebar text-sidebar-foreground rounded-lg p-4 font-mono text-sm overflow-x-auto">
                  <pre>{`{
  "success": true,
  "data": {
    "id": "msg_12345",
    "contact_id": "12345",
    "message": "Olá! Como posso ajudar?",
    "status": "sent",
    "created_at": "2024-12-29T10:30:00Z"
  }
}`}</pre>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

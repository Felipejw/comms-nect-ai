import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { CheckCircle2, XCircle, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative group">
      <div className="flex items-center justify-between bg-muted/50 px-4 py-2 rounded-t-lg border border-b-0 border-border">
        <span className="text-xs font-mono text-muted-foreground">{language}</span>
        <button onClick={handleCopy} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          {copied ? "✓ Copiado" : "Copiar"}
        </button>
      </div>
      <pre className="bg-muted p-4 rounded-b-lg border border-border overflow-x-auto text-sm"><code>{code}</code></pre>
    </div>
  );
}

function EndpointCard({ method, path, description, permission, body, response, children }: {
  method: string; path: string; description: string; permission: string;
  body?: string; response: string; children?: React.ReactNode;
}) {
  const methodColor: Record<string, string> = { GET: "default", POST: "destructive" };
  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex items-center gap-3">
          <Badge variant={methodColor[method] as any || "default"}>{method}</Badge>
          <code className="text-sm font-mono text-foreground">{path}</code>
        </div>
        <CardDescription>{description}</CardDescription>
        <Badge variant="outline" className="w-fit text-xs">Permissão: {permission}</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        {children}
        {body && (<><p className="text-sm font-medium">Body (JSON):</p><CodeBlock language="json" code={body} /></>)}
        <p className="text-sm font-medium">Resposta:</p>
        <CodeBlock language="json" code={response} />
      </CardContent>
    </Card>
  );
}

function StepCard({ step, title, children }: { step: number; title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold shrink-0">
            {step}
          </div>
          <CardTitle className="text-lg">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default function ApiDocs() {
  const { getSetting } = useSystemSettings();
  const [apiKeyPreview, setApiKeyPreview] = useState("");

  const apiUrl = getSetting("api_base_url");
  const baseUrl = `${(apiUrl || "https://seu-dominio.com").replace(/\/$/, "")}/functions/v1/api-gateway`;
  const apiKey = apiKeyPreview || "tf_sua_chave_aqui";

  const tabItems = [
    { value: "inicio", label: "Início" },
    { value: "auth", label: "Autenticação" },
    { value: "messages", label: "Mensagens" },
    { value: "contacts", label: "Contatos" },
    { value: "conversations", label: "Conversas" },
    { value: "connections", label: "Conexões" },
  ];

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold">Documentação da API</h2>
        <p className="text-muted-foreground">Integre sistemas externos com o TalkFlow via API REST.</p>
      </div>

      {/* Status indicator */}
      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-1.5">
          {apiUrl ? (
            <CheckCircle2 className="h-4 w-4 text-primary" />
          ) : (
            <XCircle className="h-4 w-4 text-destructive" />
          )}
          <span className="text-muted-foreground">URL Base da API:</span>
          <span className={apiUrl ? "font-medium text-foreground" : "text-destructive font-medium"}>
            {apiUrl || "Não configurada"}
          </span>
        </div>
      </div>

      {!apiUrl && (
        <div className="bg-accent/50 border border-border text-foreground rounded-lg p-4 text-sm">
          <strong>⚠️ URL base da API não configurada.</strong>{" "}
          Vá em <Link to="/configuracoes" className="underline font-medium hover:text-primary">Configurações → Opções</Link> e defina o endereço do seu servidor no campo "URL Base da API" para que os exemplos abaixo reflitam o endereço correto.
        </div>
      )}

      {/* Interactive API Key input */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-muted-foreground">
          Cole sua API Key para preencher os exemplos automaticamente (não é salva):
        </label>
        <Input
          placeholder="tf_sua_chave_aqui"
          value={apiKeyPreview}
          onChange={(e) => setApiKeyPreview(e.target.value)}
          className="max-w-md font-mono text-sm"
        />
      </div>

      <Tabs defaultValue="inicio" className="w-full">
        <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent flex-wrap">
          {tabItems.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-3">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="mt-6">
          {/* Quick Start */}
          <TabsContent value="inicio" className="mt-0 space-y-4">
            <StepCard step={1} title="Configure a URL base do servidor">
              <p className="text-sm text-muted-foreground mb-3">
                Defina o endereço do seu servidor para que a API funcione corretamente.
              </p>
              <Link to="/configuracoes" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
                Ir para Configurações → Opções <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </StepCard>

            <StepCard step={2} title="Crie uma chave API">
              <p className="text-sm text-muted-foreground mb-3">
                Gere uma chave API com as permissões necessárias (read, write, send).
              </p>
              <Link to="/configuracoes" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
                Ir para Configurações → API Keys <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </StepCard>

            <StepCard step={3} title="Faça sua primeira chamada">
              <p className="text-sm text-muted-foreground mb-3">
                Teste a conexão com um health check:
              </p>
              <CodeBlock language="bash" code={`curl -H "X-API-Key: ${apiKey}" \\\n  ${baseUrl}/health`} />
            </StepCard>

            <StepCard step={4} title="Envie sua primeira mensagem">
              <p className="text-sm text-muted-foreground mb-3">
                Envie uma mensagem WhatsApp via API:
              </p>
              <CodeBlock language="bash" code={`curl -X POST ${baseUrl}/messages/send \\\n  -H "X-API-Key: ${apiKey}" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "phone": "5511999999999",\n    "message": "Olá! Mensagem via API."\n  }'`} />
            </StepCard>
          </TabsContent>

          {/* Auth */}
          <TabsContent value="auth" className="mt-0 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Autenticação</CardTitle>
                <CardDescription>Todas as requisições devem incluir a chave API no header.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm">Adicione o header <code className="bg-muted px-2 py-1 rounded text-xs">X-API-Key</code> em cada requisição:</p>
                <CodeBlock language="bash" code={`curl -H "X-API-Key: ${apiKey}" \\\n  ${baseUrl}/health`} />
                <CodeBlock language="javascript" code={`const response = await fetch("${baseUrl}/contacts", {\n  headers: {\n    "X-API-Key": "${apiKey}",\n    "Content-Type": "application/json"\n  }\n});\nconst data = await response.json();`} />
                <CodeBlock language="python" code={`import requests\n\nheaders = {\n    "X-API-Key": "${apiKey}",\n    "Content-Type": "application/json"\n}\n\nresponse = requests.get("${baseUrl}/contacts", headers=headers)\ndata = response.json()`} />

                <Card className="bg-muted/30">
                  <CardContent className="pt-6">
                    <h4 className="font-medium mb-2">Permissões</h4>
                    <ul className="text-sm space-y-1 text-muted-foreground">
                      <li><Badge variant="secondary" className="mr-2">read</Badge>Consultar contatos, conversas, mensagens e conexões</li>
                      <li><Badge variant="secondary" className="mr-2">write</Badge>Criar e editar contatos</li>
                      <li><Badge variant="secondary" className="mr-2">send</Badge>Enviar mensagens WhatsApp</li>
                    </ul>
                  </CardContent>
                </Card>

                <Card className="bg-muted/30">
                  <CardContent className="pt-6">
                    <h4 className="font-medium mb-2">Códigos de Erro</h4>
                    <ul className="text-sm space-y-1 text-muted-foreground">
                      <li><code className="mr-2">401</code>Chave inválida ou expirada</li>
                      <li><code className="mr-2">403</code>Permissão insuficiente</li>
                      <li><code className="mr-2">404</code>Rota não encontrada</li>
                      <li><code className="mr-2">500</code>Erro interno</li>
                    </ul>
                  </CardContent>
                </Card>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Messages */}
          <TabsContent value="messages" className="mt-0">
            <EndpointCard method="POST" path="/messages/send" description="Envia uma mensagem via WhatsApp para um número de telefone." permission="send"
              body={`{\n  "phone": "5511999999999",\n  "message": "Olá! Esta é uma mensagem via API.",\n  "mediaUrl": "https://example.com/image.jpg",\n  "mediaType": "image",\n  "connectionId": "uuid-opcional"\n}`}
              response={`{\n  "success": true,\n  "data": {\n    "messageId": "msg_abc123"\n  }\n}`}
            >
              <div className="text-sm text-muted-foreground space-y-1">
                <p><strong>phone</strong> (obrigatório) — Número com código do país</p>
                <p><strong>message</strong> (obrigatório) — Texto da mensagem</p>
                <p><strong>mediaUrl</strong> (opcional) — URL da mídia</p>
                <p><strong>mediaType</strong> (opcional) — image, audio, video, document</p>
                <p><strong>connectionId</strong> (opcional) — ID da conexão específica</p>
              </div>
            </EndpointCard>
          </TabsContent>

          {/* Contacts */}
          <TabsContent value="contacts" className="mt-0 space-y-4">
            <EndpointCard method="GET" path="/contacts" description="Lista todos os contatos com paginação e busca." permission="read"
              response={`{\n  "data": [\n    {\n      "id": "uuid",\n      "name": "João Silva",\n      "phone": "5511999999999",\n      "email": "joao@email.com",\n      "status": "active"\n    }\n  ],\n  "total": 150,\n  "limit": 50,\n  "offset": 0\n}`}
            >
              <div className="text-sm text-muted-foreground space-y-1">
                <p><strong>?limit=50</strong> — Itens por página (padrão: 50)</p>
                <p><strong>?offset=0</strong> — Deslocamento para paginação</p>
                <p><strong>?search=texto</strong> — Busca por nome, telefone ou email</p>
              </div>
            </EndpointCard>
            <EndpointCard method="GET" path="/contacts/:id" description="Busca um contato específico por ID." permission="read"
              response={`{\n  "data": {\n    "id": "uuid",\n    "name": "João Silva",\n    "phone": "5511999999999",\n    "email": "joao@email.com"\n  }\n}`}
            />
            <EndpointCard method="POST" path="/contacts" description="Cria um novo contato." permission="write"
              body={`{\n  "name": "Maria Santos",\n  "phone": "5511988888888",\n  "email": "maria@email.com",\n  "company": "Empresa X"\n}`}
              response={`{\n  "data": {\n    "id": "uuid",\n    "name": "Maria Santos",\n    "phone": "5511988888888"\n  }\n}`}
            />
          </TabsContent>

          {/* Conversations */}
          <TabsContent value="conversations" className="mt-0 space-y-4">
            <EndpointCard method="GET" path="/conversations" description="Lista conversas com filtro por status." permission="read"
              response={`{\n  "data": [\n    {\n      "id": "uuid",\n      "status": "in_progress",\n      "unread_count": 3,\n      "last_message_at": "2025-01-01T12:00:00Z",\n      "contacts": { "name": "João", "phone": "5511999999999" }\n    }\n  ],\n  "total": 45\n}`}
            >
              <div className="text-sm text-muted-foreground space-y-1">
                <p><strong>?status=in_progress</strong> — Filtrar por status (new, in_progress, resolved, archived)</p>
                <p><strong>?limit=50&offset=0</strong> — Paginação</p>
              </div>
            </EndpointCard>
            <EndpointCard method="GET" path="/conversations/:id/messages" description="Lista as mensagens de uma conversa." permission="read"
              response={`{\n  "data": [\n    {\n      "id": "uuid",\n      "content": "Olá!",\n      "message_type": "text",\n      "sender_type": "contact",\n      "created_at": "2025-01-01T12:00:00Z"\n    }\n  ],\n  "total": 120\n}`}
            />
          </TabsContent>

          {/* Connections */}
          <TabsContent value="connections" className="mt-0">
            <EndpointCard method="GET" path="/connections" description="Lista todas as conexões WhatsApp e seus status." permission="read"
              response={`{\n  "data": [\n    {\n      "id": "uuid",\n      "name": "WhatsApp Principal",\n      "type": "whatsapp",\n      "status": "connected",\n      "phone_number": "5511999999999"\n    }\n  ]\n}`}
            />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

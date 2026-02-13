import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useSystemSettings } from "@/hooks/useSystemSettings";

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

export default function ApiDocs() {
  const { getSetting } = useSystemSettings();
  const apiUrl = getSetting("api_base_url") || window.location.origin;
  const baseUrl = `${apiUrl.replace(/\/$/, "")}/functions/v1/api-gateway`;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold">Documentação da API</h2>
        <p className="text-muted-foreground">Integre sistemas externos com o TalkFlow via API REST.</p>
      </div>

      <Tabs defaultValue="auth" className="w-full">
        <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent flex-wrap">
          {["auth", "messages", "contacts", "conversations", "connections"].map((tab) => (
            <TabsTrigger key={tab} value={tab} className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-3 capitalize">
              {tab === "auth" ? "Autenticação" : tab === "messages" ? "Mensagens" : tab === "contacts" ? "Contatos" : tab === "conversations" ? "Conversas" : "Conexões"}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="mt-6">
          {/* Auth */}
          <TabsContent value="auth" className="mt-0 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Autenticação</CardTitle>
                <CardDescription>Todas as requisições devem incluir a chave API no header.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm">Adicione o header <code className="bg-muted px-2 py-1 rounded text-xs">X-API-Key</code> em cada requisição:</p>
                <CodeBlock language="bash" code={`curl -H "X-API-Key: tf_sua_chave_aqui" \\\n  ${baseUrl}/health`} />
                <CodeBlock language="javascript" code={`const response = await fetch("${baseUrl}/contacts", {\n  headers: {\n    "X-API-Key": "tf_sua_chave_aqui",\n    "Content-Type": "application/json"\n  }\n});\nconst data = await response.json();`} />
                <CodeBlock language="python" code={`import requests\n\nheaders = {\n    "X-API-Key": "tf_sua_chave_aqui",\n    "Content-Type": "application/json"\n}\n\nresponse = requests.get("${baseUrl}/contacts", headers=headers)\ndata = response.json()`} />

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

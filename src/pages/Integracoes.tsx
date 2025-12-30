import { useState } from "react";
import { Plug, ExternalLink, Settings, CheckCircle, XCircle, RefreshCw, Copy, Loader2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useWhatsAppConnections } from "@/hooks/useWhatsAppConnections";
import { useToast } from "@/hooks/use-toast";

export default function Integracoes() {
  const { connections, isLoading, refetch } = useWhatsAppConnections();
  const { toast } = useToast();
  const [webhookDialogOpen, setWebhookDialogOpen] = useState(false);

  const connectedCount = connections.filter(c => c.status === "connected").length;
  const totalCount = connections.length;

  const webhookUrl = `https://qfmeqvkwkbafnuybbuma.supabase.co/functions/v1/evolution-webhook`;

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    toast({
      title: "Copiado!",
      description: "URL do webhook copiada para a área de transferência",
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Plug className="w-7 h-7" />
            Integrações
          </h2>
          <p className="text-muted-foreground">Conecte serviços externos ao sistema</p>
        </div>
        <Button variant="outline" onClick={() => refetch()} disabled={isLoading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {/* Evolution API Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-green-500/10 flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="w-7 h-7 text-green-500" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
              </div>
              <div>
                <CardTitle className="flex items-center gap-2">
                  Evolution API
                  {connectedCount > 0 ? (
                    <Badge className="bg-green-500/10 text-green-500">Ativo</Badge>
                  ) : (
                    <Badge variant="secondary">Inativo</Badge>
                  )}
                </CardTitle>
                <CardDescription>API para conexão com WhatsApp</CardDescription>
              </div>
            </div>
            <Dialog open={webhookDialogOpen} onOpenChange={setWebhookDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Settings className="w-4 h-4 mr-2" />
                  Configurar Webhook
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Configurar Webhook na Evolution API</DialogTitle>
                  <DialogDescription>
                    Siga as instruções abaixo para configurar o webhook na sua Evolution API
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="p-4 bg-muted rounded-lg">
                    <h4 className="font-medium mb-2 flex items-center gap-2">
                      <Info className="w-4 h-4" />
                      URL do Webhook
                    </h4>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 p-2 bg-background rounded border text-sm break-all">
                        {webhookUrl}
                      </code>
                      <Button variant="outline" size="icon" onClick={copyWebhookUrl}>
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="font-medium">Passos para configurar:</h4>
                    <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                      <li>Acesse o painel de administração da sua Evolution API</li>
                      <li>Vá em <strong>Configurações</strong> ou <strong>Settings</strong></li>
                      <li>Encontre a seção <strong>Webhook</strong></li>
                      <li>Cole a URL acima no campo de webhook global ou por instância</li>
                      <li>Habilite os eventos:
                        <ul className="list-disc list-inside ml-4 mt-1">
                          <li><code>MESSAGES_UPSERT</code> - Para receber mensagens</li>
                          <li><code>CONNECTION_UPDATE</code> - Para status de conexão</li>
                          <li><code>QRCODE_UPDATED</code> - Para QR Code</li>
                        </ul>
                      </li>
                      <li>Salve as configurações</li>
                    </ol>
                  </div>

                  <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                    <p className="text-sm text-yellow-600 dark:text-yellow-400">
                      <strong>Importante:</strong> Certifique-se de que sua Evolution API consegue acessar a internet 
                      para enviar webhooks para nossa URL.
                    </p>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Stats */}
              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 bg-muted/50 rounded-lg text-center">
                  <p className="text-2xl font-bold">{totalCount}</p>
                  <p className="text-sm text-muted-foreground">Instâncias</p>
                </div>
                <div className="p-4 bg-green-500/10 rounded-lg text-center">
                  <p className="text-2xl font-bold text-green-500">{connectedCount}</p>
                  <p className="text-sm text-muted-foreground">Conectadas</p>
                </div>
                <div className="p-4 bg-muted/50 rounded-lg text-center">
                  <p className="text-2xl font-bold">{totalCount - connectedCount}</p>
                  <p className="text-sm text-muted-foreground">Desconectadas</p>
                </div>
              </div>

              {/* Connections List */}
              {connections.length > 0 ? (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground">Conexões</h4>
                  <div className="space-y-2">
                    {connections.map((conn) => (
                      <div
                        key={conn.id}
                        className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          {conn.status === "connected" ? (
                            <CheckCircle className="w-5 h-5 text-green-500" />
                          ) : (
                            <XCircle className="w-5 h-5 text-muted-foreground" />
                          )}
                          <div>
                            <p className="font-medium">{conn.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {conn.phone_number || "Sem número"}
                            </p>
                          </div>
                        </div>
                        <Badge
                          variant={conn.status === "connected" ? "default" : "secondary"}
                          className={conn.status === "connected" ? "bg-green-500" : ""}
                        >
                          {conn.status === "connected" ? "Online" : conn.status === "qr_code" ? "Aguardando QR" : "Offline"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground">
                  <p>Nenhuma conexão configurada</p>
                  <Button variant="link" className="mt-2" asChild>
                    <a href="/conexoes">Criar conexão WhatsApp</a>
                  </Button>
                </div>
              )}

              <div className="flex justify-end">
                <Button variant="outline" asChild>
                  <a href="/conexoes">
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Gerenciar Conexões
                  </a>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Future Integrations */}
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
            <Plug className="w-6 h-6 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Mais Integrações em Breve</h3>
          <p className="text-muted-foreground text-center max-w-md mb-4">
            Em breve você poderá conectar mais serviços externos.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {["CRM", "E-mail Marketing", "ERP", "Pagamentos", "Analytics"].map((item) => (
              <Badge key={item} variant="secondary">
                {item}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

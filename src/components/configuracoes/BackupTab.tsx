import { useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Download, Upload, FileJson, AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const TABLES_ORDER = [
  "profiles", "user_roles", "user_permissions",
  "tags", "kanban_columns", "queues",
  "queue_agents",
  "contacts", "contact_tags",
  "connections",
  "chatbot_flows", "chatbot_rules",
  "flow_nodes", "flow_edges",
  "conversations", "conversation_tags",
  "messages",
  "campaigns", "campaign_contacts",
  "quick_replies", "schedules",
  "message_templates",
  "integrations", "ai_settings",
  "system_settings",
  "activity_logs",
] as const;

type TableName = (typeof TABLES_ORDER)[number];

interface BackupData {
  meta: {
    version: string;
    created_at: string;
    tables: Record<string, number>;
  };
  data: Record<string, any[]>;
}

async function fetchAllRows(table: string): Promise<any[]> {
  const PAGE = 1000;
  let offset = 0;
  let all: any[] = [];
  while (true) {
    const { data, error } = await (supabase.from(table as any) as any)
      .select("*")
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

export function BackupTab() {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [preview, setPreview] = useState<BackupData | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const backupRef = useRef<BackupData | null>(null);

  const handleExport = async () => {
    setExporting(true);
    setProgress(0);
    setProgressLabel("Iniciando exportação...");
    try {
      const backupData: BackupData = {
        meta: { version: "1.0", created_at: new Date().toISOString(), tables: {} },
        data: {},
      };
      for (let i = 0; i < TABLES_ORDER.length; i++) {
        const table = TABLES_ORDER[i];
        setProgressLabel(`Exportando ${table}...`);
        setProgress(Math.round(((i) / TABLES_ORDER.length) * 100));
        const rows = await fetchAllRows(table);
        backupData.data[table] = rows;
        backupData.meta.tables[table] = rows.length;
      }
      setProgress(100);
      setProgressLabel("Gerando arquivo...");

      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      a.href = url;
      a.download = `backup-${ts}.json`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success("Backup exportado com sucesso!");
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao exportar: " + (err.message || err));
    } finally {
      setExporting(false);
      setProgress(0);
      setProgressLabel("");
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as BackupData;
      if (!parsed.meta || !parsed.data || !parsed.meta.version) {
        toast.error("Formato de arquivo inválido.");
        return;
      }
      setPreview(parsed);
      backupRef.current = parsed;
    } catch {
      toast.error("Erro ao ler o arquivo. Verifique se é um JSON válido.");
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleImport = async () => {
    const backup = backupRef.current;
    if (!backup) return;
    setConfirmOpen(false);
    setImporting(true);
    setProgress(0);

    try {
      const tables = TABLES_ORDER.filter((t) => backup.data[t]?.length > 0);
      for (let i = 0; i < tables.length; i++) {
        const table = tables[i];
        const rows = backup.data[table];
        setProgressLabel(`Restaurando ${table} (${rows.length} registros)...`);
        setProgress(Math.round((i / tables.length) * 100));

        // Upsert in batches of 500
        const BATCH = 500;
        for (let j = 0; j < rows.length; j += BATCH) {
          const batch = rows.slice(j, j + BATCH);
          const { error } = await (supabase.from(table as any) as any).upsert(batch, {
            onConflict: "id",
            ignoreDuplicates: false,
          });
          if (error) {
            console.error(`Erro em ${table}:`, error);
            toast.error(`Erro ao restaurar ${table}: ${error.message}`);
          }
        }
      }
      setProgress(100);
      setProgressLabel("Restauração concluída!");
      toast.success("Backup restaurado com sucesso!");
      setPreview(null);
      backupRef.current = null;
    } catch (err: any) {
      console.error(err);
      toast.error("Erro na restauração: " + (err.message || err));
    } finally {
      setImporting(false);
      setTimeout(() => {
        setProgress(0);
        setProgressLabel("");
      }, 3000);
    }
  };

  const totalRecords = preview
    ? Object.values(preview.meta.tables).reduce((a, b) => a + b, 0)
    : 0;

  return (
    <div className="space-y-6">
      {/* Export Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Exportar Backup
          </CardTitle>
          <CardDescription>
            Baixe todos os dados do sistema em um arquivo JSON
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={handleExport} disabled={exporting || importing}>
            <FileJson className="h-4 w-4 mr-2" />
            {exporting ? "Exportando..." : "Gerar Backup"}
          </Button>
          {exporting && (
            <div className="space-y-2">
              <Progress value={progress} className="h-3" />
              <p className="text-sm text-muted-foreground">{progressLabel}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Import Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Importar Backup
          </CardTitle>
          <CardDescription>
            Restaure os dados a partir de um arquivo de backup previamente exportado
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            onChange={handleFileChange}
            disabled={importing || exporting}
            className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
          />

          {preview && (
            <div className="rounded-md border p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                Arquivo válido — v{preview.meta.version} — {new Date(preview.meta.created_at).toLocaleString("pt-BR")}
              </div>
              <p className="text-sm text-muted-foreground">
                Total: <strong>{totalRecords.toLocaleString()}</strong> registros em{" "}
                <strong>{Object.keys(preview.meta.tables).length}</strong> tabelas
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 text-xs">
                {Object.entries(preview.meta.tables).map(([table, count]) => (
                  <div key={table} className="flex justify-between bg-muted rounded px-2 py-1">
                    <span className="truncate">{table}</span>
                    <span className="font-mono ml-1">{(count as number).toLocaleString()}</span>
                  </div>
                ))}
              </div>
              <Button
                variant="destructive"
                onClick={() => setConfirmOpen(true)}
                disabled={importing}
              >
                <AlertTriangle className="h-4 w-4 mr-2" />
                Restaurar Backup
              </Button>
            </div>
          )}

          {importing && (
            <div className="space-y-2">
              <Progress value={progress} className="h-3" />
              <p className="text-sm text-muted-foreground">{progressLabel}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Restauração</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação irá sobrescrever dados existentes com os dados do backup. 
              Registros com o mesmo ID serão atualizados. Esta ação não pode ser desfeita.
              <br /><br />
              Deseja continuar com a restauração de <strong>{totalRecords.toLocaleString()}</strong> registros?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleImport} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Sim, Restaurar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

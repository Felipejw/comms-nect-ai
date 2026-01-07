import { useState, useRef, useMemo } from "react";
import { 
  Plus, X, Upload, ClipboardPaste, Users, Tag, Image, FileVideo, FileText,
  AlertTriangle, Shield, ShieldCheck, Clock, Save, Loader2, Sparkles
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  useCreateCampaign, 
  useAddContactsToCampaign,
  useMessageTemplates,
  useCreateMessageTemplate,
  MessageTemplate
} from "@/hooks/useCampaigns";
import { useContacts, useCreateContact } from "@/hooks/useContacts";
import { useTags } from "@/hooks/useTags";
import { useAuth } from "@/contexts/AuthContext";

// Helper to extract phone numbers from text
const extractPhoneNumbers = (text: string): string[] => {
  const lines = text.split(/[\n,;]+/);
  const phones: string[] = [];
  
  for (const line of lines) {
    const cleaned = line.trim().replace(/[^\d+]/g, '');
    if (cleaned.length >= 8 && cleaned.length <= 15) {
      phones.push(cleaned);
    }
  }
  
  return [...new Set(phones)];
};

// Parse CSV for phone import
const parseCSVForPhones = (content: string): { headers: string[]; rows: string[][] } => {
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = lines.slice(1).map(line => {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    return values;
  });
  return { headers, rows };
};

// Calculate risk level
function calculateRiskLevel(settings: {
  minInterval: number;
  useVariations: boolean;
  contactCount: number;
}): 'low' | 'medium' | 'high' {
  let score = 0;
  
  if (settings.minInterval < 30) score += 3;
  else if (settings.minInterval < 60) score += 1;
  
  if (!settings.useVariations) score += 1;
  
  if (settings.contactCount > 300) score += 2;
  else if (settings.contactCount > 100) score += 1;
  
  if (score >= 4) return 'high';
  if (score >= 2) return 'medium';
  return 'low';
}

interface CampaignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CampaignDialog({ open, onOpenChange }: CampaignDialogProps) {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Form state - Message
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  
  // Variations
  const [useVariations, setUseVariations] = useState(false);
  const [variations, setVariations] = useState<string[]>(["", ""]);
  
  // Buttons
  const [useButtons, setUseButtons] = useState(false);
  const [buttons, setButtons] = useState<Array<{ id: string; text: string }>>([]);
  
  // Media
  const [mediaType, setMediaType] = useState<"none" | "image" | "video" | "document">("none");
  const [mediaUrl, setMediaUrl] = useState("");
  
  // Security Settings
  const [minInterval, setMinInterval] = useState(30);
  const [maxInterval, setMaxInterval] = useState(60);
  
  // Schedule
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  
  // Contacts
  const [contactSource, setContactSource] = useState<"list" | "paste" | "file">("list");
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [pastedNumbers, setPastedNumbers] = useState("");
  const [parsedNumbers, setParsedNumbers] = useState<string[]>([]);
  const [csvData, setCsvData] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [phoneColumnIndex, setPhoneColumnIndex] = useState<number>(-1);
  const [nameColumnIndex, setNameColumnIndex] = useState<number>(-1);
  const [createContactsFromImport, setCreateContactsFromImport] = useState(true);

  // Hooks
  const { data: contacts = [] } = useContacts();
  const { data: tags = [] } = useTags();
  const { data: templates = [] } = useMessageTemplates();
  const createCampaign = useCreateCampaign();
  const addContacts = useAddContactsToCampaign();
  const createContact = useCreateContact();
  const createTemplate = useCreateMessageTemplate();

  // Filter contacts by selected tags
  const filteredContacts = selectedTagIds.length > 0
    ? contacts.filter(contact => 
        contact.tags?.some(tag => selectedTagIds.includes(tag.id))
      )
    : contacts;

  // Calculate contact count for risk calculation
  const contactCount = useMemo(() => {
    if (contactSource === "list") return selectedContactIds.length;
    if (contactSource === "paste") return parsedNumbers.length;
    if (contactSource === "file" && csvData) return csvData.rows.length;
    return 0;
  }, [contactSource, selectedContactIds, parsedNumbers, csvData]);

  // Calculate risk level
  const riskLevel = useMemo(() => 
    calculateRiskLevel({ minInterval, useVariations, contactCount }), 
    [minInterval, useVariations, contactCount]
  );

  const resetForm = () => {
    setName("");
    setDescription("");
    setMessage("");
    setSelectedTemplateId("");
    setUseVariations(false);
    setVariations(["", ""]);
    setUseButtons(false);
    setButtons([]);
    setMediaType("none");
    setMediaUrl("");
    setMinInterval(30);
    setMaxInterval(60);
    setScheduleEnabled(false);
    setScheduledAt("");
    setContactSource("list");
    setSelectedContactIds([]);
    setSelectedTagIds([]);
    setPastedNumbers("");
    setParsedNumbers([]);
    setCsvData(null);
    setPhoneColumnIndex(-1);
    setNameColumnIndex(-1);
    setCreateContactsFromImport(true);
  };

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const template = templates.find(t => t.id === templateId);
    if (template) {
      setMessage(template.message);
      setMediaUrl(template.media_url || "");
      setMediaType((template.media_type as "none" | "image" | "video" | "document") || "none");
    }
  };

  const handleSaveTemplate = async () => {
    if (!name.trim() || !message.trim()) return;
    
    await createTemplate.mutateAsync({
      name: name.trim(),
      message: message.trim(),
      media_url: mediaUrl || undefined,
      media_type: mediaType !== "none" ? mediaType : undefined,
      created_by: user?.id,
    });
  };

  const handleCreateCampaign = async () => {
    if (!name.trim() || !message.trim()) return;

    const campaign = await createCampaign.mutateAsync({
      name: name.trim(),
      description: description.trim() || undefined,
      message: message.trim(),
      media_url: mediaUrl.trim() || undefined,
      media_type: mediaType !== "none" ? mediaType : undefined,
      scheduled_at: scheduleEnabled && scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
      message_variations: useVariations ? variations.filter(Boolean) : undefined,
      use_variations: useVariations,
      use_buttons: useButtons,
      buttons: useButtons ? buttons : undefined,
      min_interval: minInterval,
      max_interval: maxInterval,
      created_by: user?.id,
    });

    let contactIdsToAdd = [...selectedContactIds];

    // Handle pasted/imported numbers
    if (contactSource === "paste" && parsedNumbers.length > 0) {
      if (createContactsFromImport) {
        for (const phone of parsedNumbers) {
          const existingContact = contacts.find(c => c.phone?.replace(/\D/g, '') === phone.replace(/\D/g, ''));
          if (existingContact) {
            contactIdsToAdd.push(existingContact.id);
          } else {
            try {
              const newContact = await createContact.mutateAsync({
                name: `Contato ${phone}`,
                phone,
              });
              if (newContact?.id) {
                contactIdsToAdd.push(newContact.id);
              }
            } catch (error) {
              console.error('Error creating contact:', error);
            }
          }
        }
      }
    } else if (contactSource === "file" && csvData && phoneColumnIndex >= 0) {
      for (const row of csvData.rows) {
        const phone = row[phoneColumnIndex]?.trim();
        if (!phone) continue;
        
        const existingContact = contacts.find(c => c.phone?.replace(/\D/g, '') === phone.replace(/\D/g, ''));
        if (existingContact) {
          contactIdsToAdd.push(existingContact.id);
        } else if (createContactsFromImport) {
          try {
            const contactName = nameColumnIndex >= 0 ? row[nameColumnIndex]?.trim() : undefined;
            const newContact = await createContact.mutateAsync({
              name: contactName || `Contato ${phone}`,
              phone,
            });
            if (newContact?.id) {
              contactIdsToAdd.push(newContact.id);
            }
          } catch (error) {
            console.error('Error creating contact:', error);
          }
        }
      }
    }

    // Add contacts to campaign
    if (contactIdsToAdd.length > 0 && campaign) {
      await addContacts.mutateAsync({
        campaignId: campaign.id,
        contactIds: [...new Set(contactIdsToAdd)],
      });
    }

    resetForm();
    onOpenChange(false);
  };

  const handlePastedNumbersChange = (text: string) => {
    setPastedNumbers(text);
    const numbers = extractPhoneNumbers(text);
    setParsedNumbers(numbers);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const parsed = parseCSVForPhones(content);
      setCsvData(parsed);
      
      const phoneIndex = parsed.headers.findIndex(h => 
        h.toLowerCase().includes('telefone') || 
        h.toLowerCase().includes('phone') || 
        h.toLowerCase().includes('celular') ||
        h.toLowerCase().includes('whatsapp')
      );
      const nameIndex = parsed.headers.findIndex(h => 
        h.toLowerCase().includes('nome') || h.toLowerCase().includes('name')
      );
      
      setPhoneColumnIndex(phoneIndex);
      setNameColumnIndex(nameIndex);
    };
    reader.readAsText(file);
  };

  const insertVariable = (variable: string) => {
    setMessage(prev => prev + `{{${variable}}}`);
  };

  const toggleContact = (contactId: string) => {
    setSelectedContactIds(prev => 
      prev.includes(contactId) 
        ? prev.filter(id => id !== contactId)
        : [...prev, contactId]
    );
  };

  const toggleTag = (tagId: string) => {
    setSelectedTagIds(prev => 
      prev.includes(tagId) 
        ? prev.filter(id => id !== tagId)
        : [...prev, tagId]
    );
  };

  const addButton = () => {
    if (buttons.length < 3) {
      setButtons([...buttons, { id: crypto.randomUUID(), text: "" }]);
    }
  };

  const removeButton = (id: string) => {
    setButtons(buttons.filter(b => b.id !== id));
  };

  const updateButton = (id: string, text: string) => {
    setButtons(buttons.map(b => b.id === id ? { ...b, text } : b));
  };

  const updateVariation = (index: number, text: string) => {
    const newVariations = [...variations];
    newVariations[index] = text;
    setVariations(newVariations);
  };

  const addVariation = () => {
    if (variations.length < 5) {
      setVariations([...variations, ""]);
    }
  };

  const removeVariation = (index: number) => {
    if (variations.length > 1) {
      setVariations(variations.filter((_, i) => i !== index));
    }
  };

  const getRiskBadge = () => {
    switch (riskLevel) {
      case 'low':
        return (
          <Badge className="bg-success/10 text-success gap-1">
            <ShieldCheck className="w-3 h-3" />
            Baixo Risco
          </Badge>
        );
      case 'medium':
        return (
          <Badge className="bg-warning/10 text-warning gap-1">
            <Shield className="w-3 h-3" />
            Risco Médio
          </Badge>
        );
      case 'high':
        return (
          <Badge className="bg-destructive/10 text-destructive gap-1">
            <AlertTriangle className="w-3 h-3" />
            Alto Risco
          </Badge>
        );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Novo Disparo em Massa</span>
            {getRiskBadge()}
          </DialogTitle>
        </DialogHeader>
        
        <Tabs defaultValue="message" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="message">Mensagem</TabsTrigger>
            <TabsTrigger value="media">Mídia</TabsTrigger>
            <TabsTrigger value="contacts">Contatos</TabsTrigger>
            <TabsTrigger value="settings">Configurações</TabsTrigger>
          </TabsList>
          
          {/* Message Tab */}
          <TabsContent value="message" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Nome do Disparo *</Label>
              <Input 
                placeholder="Ex: Promoção de Verão" 
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Descrição</Label>
              <Input 
                placeholder="Descreva o objetivo do disparo"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="flex gap-2 items-end">
              <div className="flex-1 space-y-2">
                <Label>Carregar Template</Label>
                <Select value={selectedTemplateId} onValueChange={handleTemplateSelect}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um template..." />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button 
                variant="outline" 
                onClick={handleSaveTemplate}
                disabled={!name.trim() || !message.trim() || createTemplate.isPending}
              >
                {createTemplate.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                <span className="ml-2">Salvar Template</span>
              </Button>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Mensagem *</Label>
                <div className="flex gap-1">
                  <Button type="button" variant="outline" size="sm" onClick={() => insertVariable("nome")}>
                    {"{{nome}}"}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => insertVariable("telefone")}>
                    {"{{telefone}}"}
                  </Button>
                </div>
              </div>
              <Textarea 
                placeholder="Digite a mensagem do disparo. Use {{nome}} para personalizar."
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>

            {/* Variations Section */}
            <div className="border rounded-lg p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <Label className="font-medium">Variações da Mensagem (Anti-Ban)</Label>
                </div>
                <Switch checked={useVariations} onCheckedChange={setUseVariations} />
              </div>
              
              {useVariations && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Adicione variações da sua mensagem para reduzir o risco de banimento.
                  </p>
                  {variations.map((variation, index) => (
                    <div key={index} className="flex gap-2">
                      <Textarea 
                        placeholder={`Variação ${index + 1}...`}
                        rows={2}
                        value={variation}
                        onChange={(e) => updateVariation(index, e.target.value)}
                        className="flex-1"
                      />
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => removeVariation(index)}
                        disabled={variations.length <= 1}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={addVariation}
                    disabled={variations.length >= 5}
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Adicionar Variação
                  </Button>
                </div>
              )}
            </div>

            {/* Buttons Section */}
            <div className="border rounded-lg p-4 space-y-4">
              <div className="flex items-center justify-between">
                <Label className="font-medium">Botões da Mensagem</Label>
                <Switch checked={useButtons} onCheckedChange={setUseButtons} />
              </div>
              
              {useButtons && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Adicione botões de resposta rápida (máx. 3).
                  </p>
                  {buttons.map((button) => (
                    <div key={button.id} className="flex gap-2">
                      <Input 
                        placeholder="Texto do botão..."
                        value={button.text}
                        onChange={(e) => updateButton(button.id, e.target.value)}
                        className="flex-1"
                        maxLength={20}
                      />
                      <Button variant="ghost" size="icon" onClick={() => removeButton(button.id)}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={addButton}
                    disabled={buttons.length >= 3}
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Adicionar Botão
                  </Button>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Media Tab */}
          <TabsContent value="media" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Tipo de Mídia</Label>
              <RadioGroup 
                value={mediaType} 
                onValueChange={(v) => setMediaType(v as typeof mediaType)}
                className="grid grid-cols-4 gap-4"
              >
                <Label 
                  htmlFor="media-none" 
                  className={`flex flex-col items-center gap-2 p-4 border rounded-lg cursor-pointer hover:bg-muted transition-colors ${mediaType === "none" ? "border-primary bg-primary/5" : ""}`}
                >
                  <RadioGroupItem value="none" id="media-none" className="sr-only" />
                  <FileText className="w-6 h-6" />
                  <span className="text-sm">Nenhuma</span>
                </Label>
                <Label 
                  htmlFor="media-image" 
                  className={`flex flex-col items-center gap-2 p-4 border rounded-lg cursor-pointer hover:bg-muted transition-colors ${mediaType === "image" ? "border-primary bg-primary/5" : ""}`}
                >
                  <RadioGroupItem value="image" id="media-image" className="sr-only" />
                  <Image className="w-6 h-6" />
                  <span className="text-sm">Imagem</span>
                </Label>
                <Label 
                  htmlFor="media-video" 
                  className={`flex flex-col items-center gap-2 p-4 border rounded-lg cursor-pointer hover:bg-muted transition-colors ${mediaType === "video" ? "border-primary bg-primary/5" : ""}`}
                >
                  <RadioGroupItem value="video" id="media-video" className="sr-only" />
                  <FileVideo className="w-6 h-6" />
                  <span className="text-sm">Vídeo</span>
                </Label>
                <Label 
                  htmlFor="media-document" 
                  className={`flex flex-col items-center gap-2 p-4 border rounded-lg cursor-pointer hover:bg-muted transition-colors ${mediaType === "document" ? "border-primary bg-primary/5" : ""}`}
                >
                  <RadioGroupItem value="document" id="media-document" className="sr-only" />
                  <FileText className="w-6 h-6" />
                  <span className="text-sm">Documento</span>
                </Label>
              </RadioGroup>
            </div>

            {mediaType !== "none" && (
              <div className="space-y-2">
                <Label>URL da Mídia</Label>
                <Input 
                  placeholder="https://exemplo.com/arquivo.jpg"
                  value={mediaUrl}
                  onChange={(e) => setMediaUrl(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Cole a URL pública do arquivo de mídia
                </p>
              </div>
            )}
          </TabsContent>

          {/* Contacts Tab */}
          <TabsContent value="contacts" className="space-y-4 pt-4">
            <div className="space-y-4">
              <Label>Origem dos Contatos</Label>
              <RadioGroup 
                value={contactSource} 
                onValueChange={(v) => setContactSource(v as "list" | "paste" | "file")} 
                className="grid grid-cols-3 gap-4"
              >
                <Label 
                  htmlFor="source-list" 
                  className={`flex flex-col items-center gap-2 p-4 border rounded-lg cursor-pointer hover:bg-muted transition-colors ${contactSource === "list" ? "border-primary bg-primary/5" : ""}`}
                >
                  <RadioGroupItem value="list" id="source-list" className="sr-only" />
                  <Users className="w-6 h-6" />
                  <span className="text-sm font-medium">Lista de Contatos</span>
                </Label>
                <Label 
                  htmlFor="source-paste" 
                  className={`flex flex-col items-center gap-2 p-4 border rounded-lg cursor-pointer hover:bg-muted transition-colors ${contactSource === "paste" ? "border-primary bg-primary/5" : ""}`}
                >
                  <RadioGroupItem value="paste" id="source-paste" className="sr-only" />
                  <ClipboardPaste className="w-6 h-6" />
                  <span className="text-sm font-medium">Colar Números</span>
                </Label>
                <Label 
                  htmlFor="source-file" 
                  className={`flex flex-col items-center gap-2 p-4 border rounded-lg cursor-pointer hover:bg-muted transition-colors ${contactSource === "file" ? "border-primary bg-primary/5" : ""}`}
                >
                  <RadioGroupItem value="file" id="source-file" className="sr-only" />
                  <Upload className="w-6 h-6" />
                  <span className="text-sm font-medium">Importar Arquivo</span>
                </Label>
              </RadioGroup>
            </div>

            {contactSource === "list" && (
              <>
                <div className="space-y-2">
                  <Label>Filtrar por Tags</Label>
                  <div className="flex flex-wrap gap-2">
                    {tags.map((tag) => (
                      <Badge
                        key={tag.id}
                        variant={selectedTagIds.includes(tag.id) ? "default" : "outline"}
                        className="cursor-pointer"
                        style={selectedTagIds.includes(tag.id) ? { backgroundColor: tag.color } : {}}
                        onClick={() => toggleTag(tag.id)}
                      >
                        <Tag className="w-3 h-3 mr-1" />
                        {tag.name}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <Label>Selecionar Contatos ({selectedContactIds.length} selecionados)</Label>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setSelectedContactIds(filteredContacts.map(c => c.id))}>
                      Selecionar todos
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setSelectedContactIds([])}>
                      Limpar
                    </Button>
                  </div>
                </div>

                <ScrollArea className="h-[250px] border rounded-lg p-2">
                  {filteredContacts.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      Nenhum contato encontrado
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredContacts.map((contact) => (
                        <div 
                          key={contact.id}
                          className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted cursor-pointer"
                          onClick={() => toggleContact(contact.id)}
                        >
                          <Checkbox 
                            checked={selectedContactIds.includes(contact.id)}
                            onCheckedChange={() => toggleContact(contact.id)}
                          />
                          <div className="flex-1">
                            <p className="font-medium text-sm">{contact.name}</p>
                            <p className="text-xs text-muted-foreground">{contact.phone || contact.email || "Sem contato"}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </>
            )}

            {contactSource === "paste" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Cole os números de telefone</Label>
                  <Textarea 
                    placeholder="Cole números separados por linha, vírgula ou ponto-e-vírgula..."
                    rows={5}
                    value={pastedNumbers}
                    onChange={(e) => handlePastedNumbersChange(e.target.value)}
                  />
                </div>
                
                {parsedNumbers.length > 0 && (
                  <div className="p-3 bg-muted rounded-lg space-y-2">
                    <p className="text-sm font-medium">{parsedNumbers.length} números detectados</p>
                    <div className="flex flex-wrap gap-1 max-h-24 overflow-auto">
                      {parsedNumbers.slice(0, 20).map((phone, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {phone}
                        </Badge>
                      ))}
                      {parsedNumbers.length > 20 && (
                        <Badge variant="outline" className="text-xs">
                          +{parsedNumbers.length - 20} mais
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
                
                <div className="flex items-center gap-2">
                  <Checkbox 
                    id="create-contacts-paste"
                    checked={createContactsFromImport}
                    onCheckedChange={(v) => setCreateContactsFromImport(!!v)}
                  />
                  <Label htmlFor="create-contacts-paste" className="text-sm">
                    Criar contatos automaticamente para números novos
                  </Label>
                </div>
              </div>
            )}

            {contactSource === "file" && (
              <div className="space-y-4">
                {!csvData ? (
                  <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
                    <Upload className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground mb-4">
                      Selecione um arquivo CSV ou TXT com números de telefone
                    </p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,.txt"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <Button onClick={() => fileInputRef.current?.click()}>
                      Selecionar Arquivo
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{csvData.rows.length} linhas encontradas</p>
                      <Button variant="ghost" size="sm" onClick={() => setCsvData(null)}>
                        <X className="w-4 h-4 mr-1" />
                        Remover
                      </Button>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Coluna do Telefone *</Label>
                        <Select value={String(phoneColumnIndex)} onValueChange={(v) => setPhoneColumnIndex(parseInt(v))}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="-1">Selecione...</SelectItem>
                            {csvData.headers.map((header, index) => (
                              <SelectItem key={index} value={String(index)}>{header}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Coluna do Nome (opcional)</Label>
                        <Select value={String(nameColumnIndex)} onValueChange={(v) => setNameColumnIndex(parseInt(v))}>
                          <SelectTrigger>
                            <SelectValue placeholder="Nenhuma" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="-1">Nenhuma</SelectItem>
                            {csvData.headers.map((header, index) => (
                              <SelectItem key={index} value={String(index)}>{header}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Checkbox 
                        id="create-contacts-file"
                        checked={createContactsFromImport}
                        onCheckedChange={(v) => setCreateContactsFromImport(!!v)}
                      />
                      <Label htmlFor="create-contacts-file" className="text-sm">
                        Criar contatos automaticamente para números novos
                      </Label>
                    </div>
                  </>
                )}
              </div>
            )}
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-6 pt-4">
            {/* Security Settings */}
            <div className="border rounded-lg p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" />
                <Label className="font-medium">Configurações de Segurança</Label>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Intervalo mínimo entre mensagens: {minInterval}s</Label>
                  </div>
                  <Slider 
                    value={[minInterval]} 
                    onValueChange={([v]) => {
                      setMinInterval(v);
                      if (v > maxInterval) setMaxInterval(v);
                    }}
                    min={10}
                    max={180}
                    step={5}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Intervalo máximo entre mensagens: {maxInterval}s</Label>
                  </div>
                  <Slider 
                    value={[maxInterval]} 
                    onValueChange={([v]) => {
                      setMaxInterval(v);
                      if (v < minInterval) setMinInterval(v);
                    }}
                    min={10}
                    max={300}
                    step={5}
                  />
                </div>
              </div>

              {/* Anti-ban tips */}
              <div className="bg-muted rounded-lg p-3 space-y-2">
                <p className="text-sm font-medium flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-warning" />
                  Dicas para evitar banimento
                </p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>• Use intervalos de 60-180 segundos entre mensagens</li>
                  <li>• Ative variações de mensagem para humanizar o envio</li>
                  <li>• Limite envios a 200-300 contatos por dia</li>
                  <li>• Evite envios fora do horário comercial (8h-20h)</li>
                  <li>• Evite links encurtados ou suspeitos</li>
                  <li>• Use {"{{nome}}"} para personalizar mensagens</li>
                </ul>
              </div>
            </div>

            {/* Schedule */}
            <div className="border rounded-lg p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-primary" />
                  <Label className="font-medium">Agendar para depois</Label>
                </div>
                <Switch checked={scheduleEnabled} onCheckedChange={setScheduleEnabled} />
              </div>
              
              {scheduleEnabled && (
                <div className="space-y-2">
                  <Label>Data e hora de início</Label>
                  <Input 
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    min={new Date().toISOString().slice(0, 16)}
                  />
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex items-center justify-between pt-4 border-t">
          <div className="text-sm text-muted-foreground">
            {contactCount > 0 && `${contactCount} contatos selecionados`}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleCreateCampaign}
              disabled={!name.trim() || !message.trim() || createCampaign.isPending}
            >
              {createCampaign.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              Criar Disparo
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

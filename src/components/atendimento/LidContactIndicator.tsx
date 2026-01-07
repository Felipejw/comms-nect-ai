import { useState, useEffect } from "react";
import { AlertTriangle, Search, Loader2, RefreshCw, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

interface Contact {
  id: string;
  name?: string | null;
  phone?: string | null;
  whatsapp_lid?: string | null;
}

interface LidContactIndicatorProps {
  contact?: Contact | null;
  conversationId?: string;
  className?: string;
}

/**
 * Detecta se o contato só possui LID (identificador interno do WhatsApp)
 * e não possui número de telefone real
 */
export function isLidOnlyContact(contact?: Contact | null): boolean {
  if (!contact) return false;
  
  // Has LID but no real phone
  if (contact.whatsapp_lid && !contact.phone) return true;
  
  // Phone equals LID (stored LID as phone)
  if (contact.phone && contact.whatsapp_lid && contact.phone === contact.whatsapp_lid) return true;
  
  // Phone is very long (looks like LID stored as phone)
  if (contact.phone && !contact.whatsapp_lid) {
    const cleanPhone = contact.phone.replace(/\D/g, "");
    // LIDs are typically 20+ digits
    if (cleanPhone.length > 15) return true;
  }
  
  return false;
}

export default function LidContactIndicator({ contact, conversationId, className }: LidContactIndicatorProps) {
  const [isSearching, setIsSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<'idle' | 'success' | 'not_found'>('idle');
  const [hasAutoSearched, setHasAutoSearched] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Check if this contact is LID-only
  const isLidOnly = isLidOnlyContact(contact);
  
  // Auto-search on first render for LID-only contacts
  useEffect(() => {
    if (isLidOnly && !hasAutoSearched && contact?.id) {
      setHasAutoSearched(true);
      handleSearchRealNumber();
    }
  }, [isLidOnly, hasAutoSearched, contact?.id]);
  
  // Reset state when contact changes
  useEffect(() => {
    setSearchResult('idle');
    setHasAutoSearched(false);
  }, [contact?.id]);
  
  if (!isLidOnly || !contact) return null;
  
  const handleSearchRealNumber = async () => {
    if (!contact.id) return;
    
    setIsSearching(true);
    setSearchResult('idle');
    
    try {
      const { data, error } = await supabase.functions.invoke('resolve-lid-contact', {
        body: { 
          contactId: contact.id,
          whatsappLid: contact.whatsapp_lid || contact.phone
        }
      });
      
      if (error) throw error;
      
      if (data?.success && data?.realPhone) {
        setSearchResult('success');
        toast({
          title: "Número encontrado!",
          description: `Número real do contato: ${data.realPhone}`,
        });
        
        // Invalidate queries to refresh data
        queryClient.invalidateQueries({ queryKey: ['contacts'] });
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
        if (conversationId) {
          queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
        }
      } else {
        setSearchResult('not_found');
        // Only show toast on manual search, not auto-search
        if (hasAutoSearched) {
          toast({
            title: "Número não encontrado",
            description: "Não foi possível localizar o número real deste contato. Ele precisa enviar uma nova mensagem.",
            variant: "destructive",
          });
        }
      }
    } catch (err) {
      console.error('Error searching for real number:', err);
      setSearchResult('not_found');
    } finally {
      setIsSearching(false);
    }
  };
  
  const lidSuffix = contact.whatsapp_lid?.slice(-6) || contact.phone?.slice(-6) || "??????";
  
  return (
    <Alert variant="destructive" className={cn("mb-3 border-warning/50 bg-warning/10", className)}>
      <AlertTriangle className="h-4 w-4 text-warning" />
      <AlertTitle className="text-warning font-medium">Contato sem número identificado</AlertTitle>
      <AlertDescription className="text-sm">
        <p className="text-muted-foreground mb-2">
          Este contato possui apenas um identificador interno do WhatsApp (LID: ...{lidSuffix}). 
          Não é possível enviar mensagens até que o número real seja descoberto ou o contato envie uma nova mensagem.
        </p>
        
        <div className="flex items-center gap-2 mt-2">
          {searchResult === 'success' ? (
            <div className="flex items-center gap-2 text-success">
              <CheckCircle className="w-4 h-4" />
              <span className="text-sm font-medium">Número encontrado! Recarregue a página.</span>
            </div>
          ) : searchResult === 'not_found' ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 text-muted-foreground">
                <XCircle className="w-4 h-4" />
                <span className="text-sm">Não encontrado</span>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleSearchRealNumber}
                disabled={isSearching}
              >
                {isSearching ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-1" />
                )}
                Tentar novamente
              </Button>
            </div>
          ) : (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleSearchRealNumber}
              disabled={isSearching}
            >
              {isSearching ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  Buscando número...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4 mr-1" />
                  Buscar número real
                </>
              )}
            </Button>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}

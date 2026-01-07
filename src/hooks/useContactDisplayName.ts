/**
 * Hook centralizado para formatação de nomes de contatos
 * Garante consistência em toda a aplicação
 */

export interface ContactInfo {
  name?: string | null;
  phone?: string | null;
  whatsapp_lid?: string | null;
}

/**
 * Detecta se um nome é placeholder/inválido
 */
export function isPlaceholderName(name?: string | null): boolean {
  if (!name) return true;
  
  // Remove espaços e hífens para análise
  const cleaned = name.replace(/[\s\-\(\)\+]/g, '');
  
  // Verifica se é apenas números (LID ou telefone armazenado como nome)
  if (/^\d{10,}$/.test(cleaned)) return true;
  
  // Verifica se contém patterns de LID
  if (name.toLowerCase().includes('@lid') || name.toLowerCase().includes(':lid')) return true;
  if (name.toLowerCase().startsWith('lid ')) return true;
  
  // Verifica nomes genéricos
  const genericNames = ['contato', 'contato desconhecido', 'unknown', 'chatbot whats'];
  if (genericNames.includes(name.toLowerCase().trim())) return true;
  
  return false;
}

/**
 * Formata telefone para exibição amigável
 */
export function formatPhoneForDisplay(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  
  // Formato brasileiro: +55 (47) 99999-9999
  if (cleaned.length === 13) {
    const country = cleaned.slice(0, 2);
    const area = cleaned.slice(2, 4);
    const firstPart = cleaned.slice(4, 9);
    const lastPart = cleaned.slice(9);
    return `+${country} (${area}) ${firstPart}-${lastPart}`;
  }
  
  // Formato brasileiro sem 9: +55 (47) 9999-9999
  if (cleaned.length === 12) {
    const country = cleaned.slice(0, 2);
    const area = cleaned.slice(2, 4);
    const firstPart = cleaned.slice(4, 8);
    const lastPart = cleaned.slice(8);
    return `+${country} (${area}) ${firstPart}-${lastPart}`;
  }
  
  // Formato com 11 dígitos: (47) 99999-9999
  if (cleaned.length === 11) {
    const area = cleaned.slice(0, 2);
    const firstPart = cleaned.slice(2, 7);
    const lastPart = cleaned.slice(7);
    return `(${area}) ${firstPart}-${lastPart}`;
  }
  
  // Formato com 10 dígitos: (47) 9999-9999
  if (cleaned.length === 10) {
    const area = cleaned.slice(0, 2);
    const firstPart = cleaned.slice(2, 6);
    const lastPart = cleaned.slice(6);
    return `(${area}) ${firstPart}-${lastPart}`;
  }
  
  return phone;
}

/**
 * Obtém o nome de exibição para um contato
 * Prioridade: nome válido > telefone formatado > LID parcial > "Contato"
 */
export function getContactDisplayName(contact?: ContactInfo): string {
  if (!contact) return "Contato";
  
  // 1. Usa nome se for válido (não placeholder)
  if (contact.name && !isPlaceholderName(contact.name)) {
    return contact.name;
  }
  
  // 2. Usa telefone formatado se disponível
  if (contact.phone) {
    return formatPhoneForDisplay(contact.phone);
  }
  
  // 3. Usa parte do LID como fallback
  if (contact.whatsapp_lid) {
    return `Contato #${contact.whatsapp_lid.slice(-6)}`;
  }
  
  return "Contato";
}

/**
 * Obtém iniciais para avatar
 */
export function getContactInitials(contact?: ContactInfo): string {
  const name = getContactDisplayName(contact);
  
  if (name === "Contato") return "?";
  
  // Para telefones/LIDs, usa últimos 2 dígitos
  if (name.startsWith("+") || name.startsWith("(") || name.startsWith("Contato #")) {
    const digits = name.replace(/\D/g, '');
    return digits.slice(-2) || "??";
  }
  
  // Para nomes, retorna iniciais
  return name
    .split(" ")
    .map(n => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/**
 * Hook para uso em componentes React
 */
export function useContactDisplayName() {
  return {
    getDisplayName: getContactDisplayName,
    getInitials: getContactInitials,
    isPlaceholderName,
    formatPhoneForDisplay,
  };
}

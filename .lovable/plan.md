

# Plano: Remover Aba Domínio das Configurações

## Objetivo
Remover a aba "Domínio" da página de Configurações, simplificando a interface.

---

## Alteração Única

### Arquivo: `src/pages/Configuracoes.tsx`

**Modificações:**

1. **Remover import do DomainTab** (linha 5):
   ```typescript
   // REMOVER esta linha:
   import { DomainTab } from "@/components/configuracoes/DomainTab";
   ```

2. **Remover variável showDomainTab** (linhas 10-12):
   ```typescript
   // REMOVER estas linhas:
   const { isAdmin, isSuperAdmin } = useAuth();
   const showDomainTab = isAdmin || isSuperAdmin;
   ```
   
   Alterar para:
   ```typescript
   const { isAdmin } = useAuth(); // Manter se usado em outro lugar
   ```

3. **Remover TabsTrigger do Domínio** (linhas 40-46):
   ```tsx
   // REMOVER este bloco:
   {showDomainTab && (
     <TabsTrigger value="dominio" ...>
       Domínio
     </TabsTrigger>
   )}
   ```

4. **Remover TabsContent do Domínio** (linhas 60-64):
   ```tsx
   // REMOVER este bloco:
   {showDomainTab && (
     <TabsContent value="dominio" className="mt-0">
       <DomainTab />
     </TabsContent>
   )}
   ```

---

## Arquivo Opcional para Deletar

O arquivo `src/components/configuracoes/DomainTab.tsx` pode ser **deletado** se não for mais utilizado em nenhum outro lugar do sistema.

---

## Resultado Final

A página de Configurações terá apenas 3 abas:
- **Perfil**
- **Opções**  
- **Personalizar**


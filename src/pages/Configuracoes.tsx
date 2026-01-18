import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProfileTab } from "@/components/configuracoes/ProfileTab";
import { OptionsTab } from "@/components/configuracoes/OptionsTab";
import { CustomizeTab } from "@/components/configuracoes/CustomizeTab";
import { DomainTab } from "@/components/configuracoes/DomainTab";
import { useAuth } from "@/contexts/AuthContext";

export default function Configuracoes() {
  const { isAdmin } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Configurações</h2>
        <p className="text-muted-foreground">
          Gerencie sua conta e preferências do sistema
        </p>
      </div>

      <Tabs defaultValue="perfil" className="w-full">
        <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent flex-wrap">
          <TabsTrigger
            value="perfil"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-3"
          >
            Perfil
          </TabsTrigger>
          <TabsTrigger
            value="opcoes"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-3"
          >
            Opções
          </TabsTrigger>
          <TabsTrigger
            value="personalizar"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-3"
          >
            Personalizar
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger
              value="dominio"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-3"
            >
              Domínio
            </TabsTrigger>
          )}
        </TabsList>

        <div className="mt-6">
          <TabsContent value="perfil" className="mt-0">
            <ProfileTab />
          </TabsContent>

          <TabsContent value="opcoes" className="mt-0">
            <OptionsTab />
          </TabsContent>

          <TabsContent value="personalizar" className="mt-0">
            <CustomizeTab />
          </TabsContent>

          {isAdmin && (
            <TabsContent value="dominio" className="mt-0">
              <DomainTab />
            </TabsContent>
          )}
        </div>
      </Tabs>
    </div>
  );
}

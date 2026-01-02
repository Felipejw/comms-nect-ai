import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { MODULES, useUserPermissions, useUpdatePermissions } from "@/hooks/usePermissions";

interface PermissionsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
}

interface PermissionState {
  can_view: boolean;
  can_edit: boolean;
}

export function PermissionsModal({ open, onOpenChange, userId, userName }: PermissionsModalProps) {
  const { data: existingPermissions = [], isLoading } = useUserPermissions(userId);
  const updatePermissions = useUpdatePermissions();
  
  const [permissions, setPermissions] = useState<Record<string, PermissionState>>({});

  // Initialize permissions when data loads
  useEffect(() => {
    if (existingPermissions.length > 0) {
      const permMap: Record<string, PermissionState> = {};
      existingPermissions.forEach(p => {
        permMap[p.module] = { can_view: p.can_view, can_edit: p.can_edit };
      });
      setPermissions(permMap);
    } else {
      // Set default permissions (all false for new users)
      const defaultPerms: Record<string, PermissionState> = {};
      MODULES.forEach(m => {
        defaultPerms[m.key] = { can_view: false, can_edit: false };
      });
      setPermissions(defaultPerms);
    }
  }, [existingPermissions]);

  const handleViewChange = (module: string, checked: boolean) => {
    setPermissions(prev => ({
      ...prev,
      [module]: {
        can_view: checked,
        // If view is unchecked, also uncheck edit
        can_edit: checked ? prev[module]?.can_edit || false : false,
      },
    }));
  };

  const handleEditChange = (module: string, checked: boolean) => {
    setPermissions(prev => ({
      ...prev,
      [module]: {
        // If edit is checked, also check view
        can_view: checked ? true : prev[module]?.can_view || false,
        can_edit: checked,
      },
    }));
  };

  const handleSave = async () => {
    const permArray = Object.entries(permissions).map(([module, perm]) => ({
      module,
      can_view: perm.can_view,
      can_edit: perm.can_edit,
    }));
    
    await updatePermissions.mutateAsync({ userId, permissions: permArray });
    onOpenChange(false);
  };

  const selectAll = (type: 'view' | 'edit', checked: boolean) => {
    setPermissions(prev => {
      const newPerms: Record<string, PermissionState> = {};
      MODULES.forEach(m => {
        if (type === 'view') {
          newPerms[m.key] = {
            can_view: checked,
            can_edit: checked ? prev[m.key]?.can_edit || false : false,
          };
        } else {
          newPerms[m.key] = {
            can_view: checked ? true : prev[m.key]?.can_view || false,
            can_edit: checked,
          };
        }
      });
      return newPerms;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Permissões: {userName}</DialogTitle>
        </DialogHeader>
        
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto pr-2 -mr-2">
            <div className="border rounded-lg">
              <div className="grid grid-cols-[1fr,80px,80px] gap-2 p-3 bg-muted/50 border-b font-medium text-sm">
                <span>Módulo</span>
                <div className="flex items-center gap-2">
                  <Checkbox 
                    checked={MODULES.every(m => permissions[m.key]?.can_view)}
                    onCheckedChange={(checked) => selectAll('view', !!checked)}
                  />
                  <span>Ver</span>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox 
                    checked={MODULES.every(m => permissions[m.key]?.can_edit)}
                    onCheckedChange={(checked) => selectAll('edit', !!checked)}
                  />
                  <span>Editar</span>
                </div>
              </div>
              
              <div className="divide-y">
                {MODULES.map(module => (
                  <div key={module.key} className="grid grid-cols-[1fr,80px,80px] gap-2 p-3 items-center hover:bg-muted/30 transition-colors">
                    <Label className="font-normal cursor-pointer">{module.label}</Label>
                    <div className="flex justify-center">
                      <Checkbox
                        checked={permissions[module.key]?.can_view || false}
                        onCheckedChange={(checked) => handleViewChange(module.key, !!checked)}
                      />
                    </div>
                    <div className="flex justify-center">
                      <Checkbox
                        checked={permissions[module.key]?.can_edit || false}
                        onCheckedChange={(checked) => handleEditChange(module.key, !!checked)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        
        <DialogFooter className="pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={updatePermissions.isPending}>
            {updatePermissions.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Salvar Permissões
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

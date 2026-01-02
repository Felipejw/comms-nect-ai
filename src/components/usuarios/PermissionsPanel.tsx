import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { MODULES } from "@/hooks/usePermissions";

export interface PermissionState {
  can_view: boolean;
  can_edit: boolean;
}

interface PermissionsPanelProps {
  permissions: Record<string, PermissionState>;
  onPermissionsChange: (permissions: Record<string, PermissionState>) => void;
}

export function PermissionsPanel({ permissions, onPermissionsChange }: PermissionsPanelProps) {
  const handleViewChange = (module: string, checked: boolean) => {
    onPermissionsChange({
      ...permissions,
      [module]: {
        can_view: checked,
        can_edit: checked ? permissions[module]?.can_edit || false : false,
      },
    });
  };

  const handleEditChange = (module: string, checked: boolean) => {
    onPermissionsChange({
      ...permissions,
      [module]: {
        can_view: checked ? true : permissions[module]?.can_view || false,
        can_edit: checked,
      },
    });
  };

  const selectAll = (type: 'view' | 'edit', checked: boolean) => {
    const newPerms: Record<string, PermissionState> = {};
    MODULES.forEach(m => {
      if (type === 'view') {
        newPerms[m.key] = {
          can_view: checked,
          can_edit: checked ? permissions[m.key]?.can_edit || false : false,
        };
      } else {
        newPerms[m.key] = {
          can_view: checked ? true : permissions[m.key]?.can_view || false,
          can_edit: checked,
        };
      }
    });
    onPermissionsChange(newPerms);
  };

  return (
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
      
      <div className="divide-y max-h-[300px] overflow-y-auto">
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
  );
}

// Helper to get default permissions
export function getDefaultPermissions(): Record<string, PermissionState> {
  const defaultPerms: Record<string, PermissionState> = {};
  MODULES.forEach(m => {
    defaultPerms[m.key] = { can_view: false, can_edit: false };
  });
  return defaultPerms;
}

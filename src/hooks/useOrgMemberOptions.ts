import { useEffect, useState } from "react";
import { RdPlatformService } from "../services/rdPlatformService";
import type { SelectOption } from "../types";

export function useOrgMemberOptions(enabled: boolean, orgId: string): SelectOption[] {
  const [options, setOptions] = useState<SelectOption[]>([]);
  useEffect(() => {
    let active = true;
    setOptions([]);
    if (enabled && orgId) {
      void RdPlatformService.getOrgMembers(orgId).then(
        (members) => {
          if (active) setOptions(members.map((m) => ({ id: m.userId, name: m.name, color: "#6c757d", avatar: m.avatar || "" })));
        },
        () => {
          if (active) setOptions([]);
        },
      );
    }
    return () => {
      active = false;
    };
  }, [enabled, orgId]);
  return options;
}

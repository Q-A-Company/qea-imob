import { ROLE_LABEL, type UserRole } from "@/lib/supabase/types";

function roleLabel(role: unknown): string {
  if (typeof role !== "string") return String(role ?? "?");
  return ROLE_LABEL[role as UserRole] ?? role;
}

// birth_date (e ProfileFieldChange.to) vem como "YYYY-MM-DD" — montar a
// data a partir das partes evita o desvio de um dia que new Date(string)
// causa em fusos negativos (interpreta a string como UTC meia-noite).
function formatBirthDateValue(value: unknown): string {
  if (typeof value !== "string" || !value) return "não informada";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString("pt-BR");
}

interface ProfileFieldChange {
  from: string | null;
  to: string | null;
}

function asFieldChange(value: unknown): ProfileFieldChange | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Record<string, unknown>;
  if (!("to" in candidate)) return undefined;
  return { from: (candidate.from as string | null) ?? null, to: (candidate.to as string | null) ?? null };
}

function capitalize(text: string): string {
  return text.length > 0 ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

export interface AuditEventInput {
  actionType: string;
  details: Record<string, unknown> | null;
}

// Formatação legível em PT-BR de cada action_type conhecido, montada
// dinamicamente a partir de `details` — só descreve o que de fato mudou
// naquele evento (ex: user_updated não menciona e-mail se só o nome
// mudou). Centralizado aqui de propósito: qualquer lugar que listar
// eventos de auditoria (hoje a aba Histórico da página de usuário) usa
// esta mesma função, em vez de reimplementar a formatação. action_type
// desconhecido cai no fallback (o próprio valor cru) — não quebra a tela
// quando um tipo novo for instrumentado sem passar por aqui ainda.
export function formatAuditEvent({ actionType, details }: AuditEventInput): string {
  const d = details ?? {};

  switch (actionType) {
    case "login":
      return "Login realizado";
    case "logout":
      return "Logout realizado";

    case "user_created": {
      const role = "role" in d ? roleLabel(d.role) : null;
      return role ? `Usuário criado com cargo ${role}` : "Usuário criado";
    }

    case "user_updated": {
      const name = asFieldChange(d.name);
      const email = asFieldChange(d.email);
      const birthDate = asFieldChange(d.birthDate);
      const parts: string[] = [];
      if (name?.to) parts.push(`nome alterado para '${name.to}'`);
      if (birthDate) parts.push(`data de nascimento definida como ${formatBirthDateValue(birthDate.to)}`);
      if (email?.to) parts.push(`e-mail alterado para ${email.to}`);
      return parts.length > 0 ? capitalize(parts.join(", ")) : "Dados atualizados";
    }

    case "user_role_changed":
      return `Cargo alterado de ${roleLabel(d.oldRole)} para ${roleLabel(d.newRole)}`;

    case "user_blocked": {
      const reason = typeof d.reason === "string" && d.reason ? d.reason : null;
      return reason ? `Acesso bloqueado — Motivo: ${reason}` : "Acesso bloqueado";
    }
    case "user_unblocked":
      return "Acesso desbloqueado";

    case "user_deleted": {
      const email = typeof d.email === "string" ? d.email : null;
      return email ? `Usuário excluído (${email})` : "Usuário excluído";
    }

    case "user_password_reset": {
      if (d.mode === "direct") return "Senha definida diretamente pelo administrador";
      const mode = d.mode === "link" ? "link" : "temporária";
      return `Senha redefinida (modo: ${mode})`;
    }
    case "user_password_changed":
      return "Senha alterada";

    case "user_avatar_updated":
      return "Foto de perfil atualizada";
    case "user_avatar_removed":
      return "Foto de perfil removida";

    case "settings_updated": {
      const channel = d.channel === "email" ? "E-mail" : d.channel === "site" ? "Site" : null;
      if (channel && typeof d.enabled === "boolean") return `Notificações por ${channel} ${d.enabled ? "ativadas" : "desativadas"}`;
      return "Configurações de notificação alteradas";
    }

    case "report_generated":
      return "Relatório gerado";

    case "competitor_created": {
      const name = typeof d.name === "string" ? d.name : null;
      return name ? `Concorrente "${name}" cadastrado` : "Concorrente cadastrado";
    }
    case "competitor_status_changed": {
      const status =
        d.newStatus === "pausado"
          ? "Pausado"
          : d.newStatus === "ativo"
            ? "Ativo"
            : d.newStatus === "arquivado"
              ? "Arquivado"
              : String(d.newStatus ?? "?");
      const name = typeof d.name === "string" ? d.name : null;
      return name ? `Status do concorrente "${name}" alterado para ${status}` : `Status do concorrente alterado para ${status}`;
    }
    case "competitor_interval_changed": {
      const minutes = typeof d.minutes === "number" ? d.minutes : null;
      const name = typeof d.name === "string" ? d.name : null;
      if (!minutes) return "Intervalo de checagem alterado";
      return name
        ? `Intervalo de checagem do concorrente "${name}" alterado para ${minutes} min`
        : `Intervalo de checagem alterado para ${minutes} min`;
    }
    case "competitor_check_triggered": {
      const name = typeof d.name === "string" ? d.name : null;
      return name ? `Checagem manual disparada para "${name}"` : "Checagem manual disparada";
    }
    case "competitor_deleted": {
      const name = typeof d.name === "string" ? d.name : null;
      return name ? `Concorrente "${name}" excluído permanentemente` : "Concorrente excluído permanentemente";
    }

    case "account_status_changed":
      return `Conta ${d.active === true ? "ativada" : "desativada"}`;
    case "account_notes_updated":
      return "Notas da conta atualizadas";
    case "account_name_changed": {
      const newName = typeof d.newName === "string" ? d.newName : null;
      return newName ? `Nome da conta alterado para "${newName}"` : "Nome da conta alterado";
    }

    default:
      return actionType;
  }
}

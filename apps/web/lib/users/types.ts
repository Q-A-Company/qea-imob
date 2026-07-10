// Tipos puros (sem "server-only") compartilhados entre as Server Actions de
// gestão de usuário (SuperAdmin em app/superadmin/accounts/[id]/actions.ts,
// Admin/Gerente em lib/users/actions.ts) e os componentes client que as
// consomem (create-user-form.tsx, user-management-table.tsx) — sem isso,
// um client component importando de um arquivo "server-only" quebraria o
// build mesmo só pegando um tipo.
export interface CreateUserState {
  error?: string;
  success?: boolean;
  createdEmail?: string;
  tempPassword?: string;
}

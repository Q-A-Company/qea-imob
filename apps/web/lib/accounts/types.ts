// Tipo puro (sem "server-only") — mesmo motivo de lib/users/types.ts: um
// client component (create-account-form.tsx) importando um tipo de um
// arquivo "use server" quebraria o build.
export interface CreateAccountState {
  error?: string;
  success?: boolean;
  accountId?: string;
  createdEmail?: string;
  tempPassword?: string;
}

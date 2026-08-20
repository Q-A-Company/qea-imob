import { Spinner } from "@/app/spinner";

// Mesmo raciocínio de (dashboard)/loading.tsx — navegar entre as abas de
// uma conta (Configurações, Concorrentes, Usuários, Erros...) mantém a
// sidebar da conta e o banner "Visualizando: X" visíveis, só o conteúdo
// mostra o spinner.
export default function AccountShellLoading() {
  return <Spinner />;
}

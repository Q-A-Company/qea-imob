import { Spinner } from "./spinner";

// Cobre a PRIMEIRA entrada em qualquer parte do app (ex: logo após o
// login, antes do layout de (dashboard)/ ou superadmin/.../ terminar de
// buscar profile/notificações/etc.) — sem isso, essa transição inicial
// ficava com a tela anterior congelada, sem nenhum indício de que algo
// estava acontecendo. Navegações DENTRO de um shell já montado usam o
// loading.tsx mais específico daquele shell (mantém a sidebar visível).
export default function Loading() {
  return <Spinner />;
}

import { Spinner } from "../spinner";

// Só envolve {children} do layout (não a sidebar/chrome em si — convenção
// do Next.js: loading.tsx cria um <Suspense> em volta do conteúdo aninhado,
// não do próprio layout que o declara) — navegar entre páginas dentro do
// painel (ex: Concorrentes → Relatórios) mantém a sidebar visível e
// clicável, só a área de conteúdo mostra o spinner enquanto a página nova
// busca os dados dela.
export default function DashboardLoading() {
  return <Spinner />;
}

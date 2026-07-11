// Arquivo separado de propósito, sem "use server" — um módulo "use server"
// só pode exportar funções assíncronas (Server Actions); exportar uma
// constante simples dali quebra silenciosamente no cliente (o valor chega
// como uma referência RPC, não o array de verdade — foi exatamente esse o
// bug: "ALLOWED_POLLING_INTERVALS.map is not a function"). Dados
// compartilhados entre client e server ficam num módulo plano como este.
//
// Reexporta de scraper/core/polling-interval — fonte única dos degraus
// disponíveis, também usada por check-competitor.ts pra decidir o
// intervalo mínimo seguro por concorrente (duração medida × 2, arredondado
// pra cima até o menor degrau aqui). Nome mantido (não virou
// AVAILABLE_INTERVALS_MINUTES) pra não precisar renomear em cada lugar do
// apps/web que já importa este símbolo.
export { AVAILABLE_INTERVALS_MINUTES as ALLOWED_POLLING_INTERVALS } from "scraper/core/polling-interval";

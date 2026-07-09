// Arquivo separado de propósito, sem "use server" — um módulo "use server"
// só pode exportar funções assíncronas (Server Actions); exportar uma
// constante simples dali quebra silenciosamente no cliente (o valor chega
// como uma referência RPC, não o array de verdade — foi exatamente esse o
// bug: "ALLOWED_POLLING_INTERVALS.map is not a function"). Dados
// compartilhados entre client e server ficam num módulo plano como este.
export const ALLOWED_POLLING_INTERVALS = [5, 10, 30, 60] as const;

// STANDBY — WhatsApp não está integrado de verdade. Decisão do usuário:
// custo do processo de aprovação como BSP (Business Solution Provider),
// tempo de aprovação, e risco residual mesmo pela via oficial não
// compensam agora. Não reintroduzir sem essa decisão ser revisitada
// explicitamente — ver packages/scraper/README.md.
//
// Isolado aqui de propósito: se/quando isso for retomado, o ponto de
// integração é só trocar o corpo desta função (ex: chamar a API do
// Twilio/Meta), sem precisar mexer em core/notify.ts nem em nenhuma tela —
// nada no resto do código depende deste arquivo hoje.
export interface WhatsAppNotification {
  accountId: string;
  to: string[];
  message: string;
}

export async function sendWhatsAppNotification(params: WhatsAppNotification): Promise<{ sent: boolean }> {
  console.log(
    `[whatsapp:noop] conta ${params.accountId}, ${params.to.length} destinatário(s) — WhatsApp em standby, nada foi enviado de verdade.`
  );
  return { sent: false };
}

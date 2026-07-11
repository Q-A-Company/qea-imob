import { Resend } from "resend";

export interface SendEmailParams {
  to: string[];
  subject: string;
  title: string;
  message: string;
  // Botão de destaque opcional (ex: link de recuperação de senha) — sem
  // isso, `message` sozinho já cobre o caso comum (resumo diário), onde não
  // faz sentido um botão gigante no meio do texto corrido.
  cta?: { text: string; url: string };
}

// Único ponto do código que efetivamente chama a API do Resend (Etapa 9).
// Só é invocado por core/notify.ts, e só quando
// notification_settings.email_enabled = true para a conta — com o default
// da tabela (`false`) e nenhuma conta alterando isso ainda, esta função
// nunca roda em uso normal até alguém ativar deliberadamente.
export async function sendEmail(params: SendEmailParams): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !from) {
    throw new Error(
      "E-mail habilitado (notification_settings.email_enabled = true) mas RESEND_API_KEY/RESEND_FROM_EMAIL não estão configurados no ambiente."
    );
  }

  const resend = new Resend(apiKey);

  const { data, error } = await resend.emails.send({
    from,
    to: params.to,
    subject: params.subject,
    html: renderEmailHtml(params.title, params.message, params.cta),
  });

  if (error) {
    throw new Error(`Falha ao enviar e-mail via Resend: ${error.message}`);
  }
  // data.id: prova de que a API do Resend aceitou o envio (não só "não deu
  // erro") — antes descartado (só `error` era desestruturado). Visível nos
  // logs do worker pra quem precisar confirmar depois que um envio saiu de
  // verdade, sem precisar caçar isso manualmente.
  console.log(`[resend] e-mail aceito — id=${data?.id ?? "?"} destinatarios=${params.to.length}`);
}

function renderEmailHtml(title: string, message: string, cta?: { text: string; url: string }): string {
  // Botão de verdade (<a> com padding, não texto cru na frase) — o que
  // motivou isso: um link de recuperação de senha escrito por extenso no
  // corpo do texto passava despercebido/parecia pouco confiável. #625cbb é
  // a cor de destaque (--color-sinal) já usada no resto do app — mesmo tom,
  // só que aqui como hex literal porque e-mail HTML não lê custom property.
  // Link cru mantido pequeno e discreto embaixo do botão — clientes de
  // e-mail que bloqueiam o botão (raro, mas acontece) ou quem só quer
  // copiar/colar ainda conseguem, sem depender só do botão.
  const ctaHtml = cta
    ? `<div style="margin-top:24px;text-align:center;">
            <a href="${escapeHtml(cta.url)}" style="display:inline-block;background:#625cbb;color:#ffffff;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600;text-decoration:none;">${escapeHtml(cta.text)}</a>
          </div>
          <p style="margin:16px 0 0;font-size:11px;line-height:1.5;color:#a3a3a3;word-break:break-all;">
            Ou copie e cole este link no navegador: ${escapeHtml(cta.url)}
          </p>`
    : "";

  return `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:24px;background:#f5f5f5;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
    <table role="presentation" width="100%" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e5e5;">
      <tr>
        <td style="padding:16px 24px;background:#171717;color:#ffffff;font-size:14px;font-weight:600;">Q&amp;A Imob</td>
      </tr>
      <tr>
        <td style="padding:24px;">
          <p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#171717;">${escapeHtml(title)}</p>
          <p style="margin:0;font-size:14px;line-height:1.5;color:#525252;white-space:pre-line;">${escapeHtml(message)}</p>
          ${ctaHtml}
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

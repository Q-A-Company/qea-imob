import { Resend } from "resend";

export interface SendEmailParams {
  to: string[];
  subject: string;
  title: string;
  message: string;
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

  const { error } = await resend.emails.send({
    from,
    to: params.to,
    subject: params.subject,
    html: renderEmailHtml(params.title, params.message),
  });

  if (error) {
    throw new Error(`Falha ao enviar e-mail via Resend: ${error.message}`);
  }
}

function renderEmailHtml(title: string, message: string): string {
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
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

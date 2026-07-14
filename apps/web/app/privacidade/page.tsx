import { getLegalDocumentMarkdown } from "@/lib/legal/content";
import { LegalDocumentView } from "../legal-document-view";

// Página pública — sem requireRole/getProfile de propósito. Linkada no
// rodapé do login, na tela de aceite obrigatório (/aceitar-termos) e em
// Configurações.
export default function PrivacidadePage() {
  return <LegalDocumentView markdown={getLegalDocumentMarkdown("privacidade")} />;
}

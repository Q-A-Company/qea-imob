"use client";

import { useRef, useState, useTransition } from "react";
import type { AccountUser } from "@/lib/users/get-account-users";
import { Avatar } from "@/app/(dashboard)/avatar";

interface ActionResult {
  error?: string;
  success?: boolean;
}

interface UploadResult extends ActionResult {
  avatarUrl?: string;
}

// Nome/e-mail/data de nascimento + upload de foto — tudo que vive em
// profiles/auth.users diretamente ligado ao colaborador (cargo e bloqueio
// ficam na aba Segurança, são sobre ACESSO, não sobre a pessoa).
export function UserEmployeeDataTab({
  user,
  onUpdateProfile,
  onUploadAvatar,
  onRemoveAvatar,
}: {
  user: AccountUser;
  onUpdateProfile: (userId: string, fullName: string, email: string, birthDate: string | null) => Promise<ActionResult>;
  onUploadAvatar: (userId: string, formData: FormData) => Promise<UploadResult>;
  onRemoveAvatar: (userId: string) => Promise<ActionResult>;
}) {
  const [fullName, setFullName] = useState(user.fullName ?? "");
  const [email, setEmail] = useState(user.email ?? "");
  const [birthDate, setBirthDate] = useState(user.birthDate ?? "");
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl);
  const [isSaving, startSaving] = useTransition();
  const [isUploading, startUploading] = useTransition();
  const [isRemoving, startRemoving] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleSave() {
    setSaveError(null);
    setSaveSuccess(false);
    startSaving(async () => {
      const result = await onUpdateProfile(user.id, fullName, email, birthDate || null);
      if (result.error) setSaveError(result.error);
      else setSaveSuccess(true);
    });
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    const formData = new FormData();
    formData.append("avatar", file);
    startUploading(async () => {
      const result = await onUploadAvatar(user.id, formData);
      if (result.error) setUploadError(result.error);
      else if (result.avatarUrl) setAvatarUrl(result.avatarUrl);
      if (fileInputRef.current) fileInputRef.current.value = "";
    });
  }

  function handleRemove() {
    setRemoveError(null);
    startRemoving(async () => {
      const result = await onRemoveAvatar(user.id);
      if (result.error) setRemoveError(result.error);
      // Some do fallback (iniciais) na hora, sem recarregar — mesmo padrão
      // de atualização otimista do upload acima (setAvatarUrl direto no
      // resultado da action, não um refresh de página).
      else setAvatarUrl(null);
    });
  }

  return (
    <div className="flex flex-col gap-6 rounded-lg border border-surface-border bg-surface p-4">
      <div className="flex items-center gap-4">
        <Avatar avatarUrl={avatarUrl} fullName={fullName} size="lg" />
        <div className="flex flex-col gap-1">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileChange}
            disabled={isUploading}
            className="text-xs text-muted file:mr-3 file:rounded-md file:border file:border-surface-border file:bg-background file:px-3 file:py-1.5 file:text-xs file:text-foreground hover:file:bg-surface"
          />
          <p className="text-[11px] text-muted">JPEG, PNG ou WebP, até 2 MB.</p>
          {isUploading && <p className="text-xs text-muted">Enviando...</p>}
          {uploadError && (
            <p className="text-xs text-erro-texto" role="alert">
              {uploadError}
            </p>
          )}
          {avatarUrl && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={isRemoving || isUploading}
              className="w-fit text-[11px] text-muted underline decoration-dotted hover:text-erro-texto disabled:opacity-60"
            >
              {isRemoving ? "Removendo..." : "Remover foto"}
            </button>
          )}
          {removeError && (
            <p className="text-xs text-erro-texto" role="alert">
              {removeError}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:max-w-md">
        <div className="flex flex-col gap-1">
          <label htmlFor="fullName" className="text-xs font-medium text-muted">
            Nome
          </label>
          <input
            id="fullName"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-signal"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="email" className="text-xs font-medium text-muted">
            E-mail
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-signal"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="birthDate" className="text-xs font-medium text-muted">
            Data de nascimento
          </label>
          <input
            id="birthDate"
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            className="w-fit rounded-md border border-surface-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-signal"
          />
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="w-fit rounded-md border border-signal/40 bg-signal/10 px-3 py-1.5 text-sm text-signal-text hover:bg-signal/15 disabled:opacity-60"
        >
          {isSaving ? "Salvando..." : "Salvar dados"}
        </button>
        {saveError && (
          <p className="text-xs text-erro-texto" role="alert">
            {saveError}
          </p>
        )}
        {saveSuccess && <p className="text-xs text-sucesso-texto">Dados atualizados.</p>}
      </div>
    </div>
  );
}

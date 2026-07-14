"use client";

import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// react-markdown usa hooks internamente — não roda como Server Component.
// Conteúdo em si (o markdown) é lido no servidor (fs, ver lib/legal/
// content.ts) e passado como string pronta; só a renderização acontece
// aqui no client.
export function LegalDocumentView({ markdown }: { markdown: string }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 bg-background px-6 py-10 text-foreground">
      <Link href="/login" className="text-sm text-signal-text hover:underline">
        ← Voltar
      </Link>
      <article className="flex flex-col gap-4 text-sm leading-relaxed">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: (props) => <h1 className="text-xl font-semibold text-foreground" {...props} />,
            h2: (props) => <h2 className="mt-4 text-base font-semibold text-foreground" {...props} />,
            h3: (props) => <h3 className="mt-2 text-sm font-semibold text-foreground" {...props} />,
            p: (props) => <p className="text-muted" {...props} />,
            strong: (props) => <strong className="font-semibold text-foreground" {...props} />,
            ul: (props) => <ul className="list-disc pl-5 text-muted" {...props} />,
            ol: (props) => <ol className="list-decimal pl-5 text-muted" {...props} />,
            li: (props) => <li className="mt-1" {...props} />,
            hr: () => <hr className="border-surface-border" />,
            a: (props) => <a className="text-signal-text hover:underline" {...props} />,
            table: (props) => (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left" {...props} />
              </div>
            ),
            thead: (props) => <thead className="border-b border-surface-border text-foreground" {...props} />,
            th: (props) => <th className="px-2 py-1.5 font-medium" {...props} />,
            td: (props) => <td className="border-b border-surface-border px-2 py-1.5 text-muted" {...props} />,
          }}
        >
          {markdown}
        </ReactMarkdown>
      </article>
    </main>
  );
}

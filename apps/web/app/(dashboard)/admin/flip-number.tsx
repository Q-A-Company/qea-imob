"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "motion/react";

// "Placar" — elemento de assinatura do redesign (substitui o radar-sweep,
// ver globals.css). Cada dígito é um tile independente que CONTA em ordem
// crescente/decrescente até o valor real (não mais uma sequência
// aleatória) — escalonado por dígito (FLIP_STEP_MS) e por instância
// (staggerMs, vindo do `delay` do KpiCard).
//
// A sequência sempre parte do último valor REALMENTE mostrado (`shown`,
// estado que persiste entre renders) até o novo `digit`:
// - Montagem: `shown` nasce em "0" (valor inicial fixo do useState) →
//   conta 0,1,2...até o dígito real. Determinístico (não depende de
//   Math.random), sem risco de mismatch de hidratação.
// - Reativo (o `value` da KpiCard mudou, ex: filtro novo ou AutoRefresh):
//   `shown` já está no ÚLTIMO dígito exibido → conta dali até o novo,
//   pra CIMA ou pra BAIXO conforme a direção real — não reinicia do zero
//   (contar 0→14 inteiro só porque foi de 15 pra 14 ficaria estranho).
// Se o dígito não mudou, a sequência tem 1 passo só (o próprio valor),
// sem animação perceptível — não força uma contagem sem sentido.
//
// Animação via animate() imperativo (API de baixo nível do Motion, direto
// no elemento via ref) em vez de AnimatePresence com troca de `key` — a
// primeira versão usava um <motion.span key={shown}> por dígito, remontando
// um elemento novo a cada troca. Na prática isso crashava o React de
// verdade ("Cannot read properties of null (reading 'removeChild')",
// capturado no log do dev server) — trocas de key rápidas e simultâneas em
// vários tiles competiam com o próprio commit do React pela mesma árvore
// DOM. Aqui o nó do dígito NUNCA desmonta: só o texto muda (setState
// normal) e um pulso de rotateX é disparado à parte, no mesmo elemento.
const FLIP_STEP_MS = 45;

// Sequência de dígitos entre o valor mostrado e o valor novo, SEM incluir
// o ponto de partida (já está na tela) — ex: de 3 pra 7 → [4,5,6,7]; de 7
// pra 3 → [6,5,4,3]; de 2 pra 2 → [2] (sem passo intermediário, digit não
// mudou de verdade).
function buildCountSequence(fromDigit: number, toDigit: number): string[] {
  if (fromDigit === toDigit) return [String(toDigit)];
  const step = toDigit > fromDigit ? 1 : -1;
  const sequence: string[] = [];
  for (let d = fromDigit + step; ; d += step) {
    sequence.push(String(d));
    if (d === toDigit) break;
  }
  return sequence;
}

function FlipDigit({ digit, staggerMs }: { digit: string; staggerMs: number }) {
  const [shown, setShown] = useState("0");
  const reduceMotion = useReducedMotion();
  const elRef = useRef<HTMLSpanElement>(null);
  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    timeouts.current.forEach(clearTimeout);
    timeouts.current = [];

    if (reduceMotion) {
      timeouts.current.push(setTimeout(() => setShown(digit), 0));
      return;
    }

    const sequence = buildCountSequence(Number(shown), Number(digit));

    sequence.forEach((value, i) => {
      timeouts.current.push(
        setTimeout(
          () => {
            setShown(value);
            if (elRef.current) {
              animate(elRef.current, { rotateX: [-90, 0] }, { duration: 0.09, ease: "easeOut" });
            }
          },
          staggerMs + i * FLIP_STEP_MS
        )
      );
    });

    return () => timeouts.current.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digit, staggerMs, reduceMotion]);

  return (
    <span className="relative inline-block h-[1.15em] w-[1ch] overflow-hidden align-baseline">
      <span ref={elRef} className="flip-tile-face absolute inset-0">
        {shown}
      </span>
    </span>
  );
}

export function FlipNumber({ value, delay = 0, className }: { value: number; delay?: number; className?: string }) {
  const digits = String(value).split("");
  const baseMs = delay * 1000;

  return (
    <span className={`inline-flex font-mono font-bold tabular-nums ${className ?? ""}`}>
      {/* key por distância da direita (casa das unidades = sempre a mesma
          key), não por índice da esquerda — precisa pra contagem fazer
          sentido quando a quantidade de dígitos muda (ex: 99 → 100): com
          key por índice, a casa das DEZENAS de "99" e a das CENTENAS de
          "100" cairiam na mesma posição (index 0) e a contagem tentaria
          ir de 9 até 1, sem sentido nenhum — os dois números nem
          representam a mesma casa decimal. Por distância da direita, a
          casa das unidades/dezenas mantém a MESMA key entre os dois
          renders (conta a partir do que já mostrava); só a nova casa das
          centenas ganha uma key nunca usada antes, e nasce do zero como
          qualquer dígito novo. */}
      {digits.map((d, i) => (
        <FlipDigit key={digits.length - i} digit={d} staggerMs={baseMs + i * 50} />
      ))}
    </span>
  );
}

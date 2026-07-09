"use client";

import { useEffect, useState } from "react";
import { animate, useReducedMotion } from "motion/react";

export function useCountUp(target: number, options?: { duration?: number; delay?: number }): number {
  const [value, setValue] = useState(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) {
      setValue(target);
      return;
    }
    const controls = animate(0, target, {
      duration: options?.duration ?? 1.2,
      delay: options?.delay ?? 0,
      ease: "easeOut",
      onUpdate: (v) => setValue(Math.round(v)),
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, reduceMotion]);

  return value;
}

import { useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from "react";

import { cn } from "@/lib/utils";

const CODE_LENGTH = 6;

export function CodeInput({
  value,
  onChange,
  onComplete,
  disabled,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (finishedCode: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const boxElements = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.padEnd(CODE_LENGTH, " ").slice(0, CODE_LENGTH).split("");

  const focusBox = (index: number) =>
    boxElements.current[Math.min(Math.max(index, 0), CODE_LENGTH - 1)]?.focus();

  useEffect(() => {
    if (value === "") focusBox(0);
  }, [value]);

  function publishCode(rawCode: string) {
    const digitsOnly = rawCode.replace(/\D/g, "").slice(0, CODE_LENGTH);
    onChange(digitsOnly);
    if (digitsOnly.length === CODE_LENGTH) onComplete?.(digitsOnly);
    return digitsOnly;
  }

  function handleAutofillOrUntypedInput(index: number, rawInput: string) {
    const enteredDigits = rawInput.replace(/\D/g, "");
    if (!enteredDigits) return;
    const chars = value.split("");
    for (
      let offset = 0;
      offset < enteredDigits.length && index + offset < CODE_LENGTH;
      offset += 1
    ) {
      chars[index + offset] = enteredDigits[offset];
    }
    publishCode(chars.join(""));
    focusBox(index + enteredDigits.length);
  }

  function overwriteBoxWithDigit(index: number, digit: string) {
    const chars = value.padEnd(index, " ").split("");
    chars[index] = digit;
    publishCode(chars.join("").replace(/ /g, ""));
    focusBox(index + 1);
  }

  function deleteDigitBefore(index: number) {
    const chars = value.split("");
    if (chars[index]) {
      chars.splice(index, 1);
      publishCode(chars.join(""));
      return;
    }
    if (index > 0) {
      chars.splice(index - 1, 1);
      publishCode(chars.join(""));
      focusBox(index - 1);
    }
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (/^\d$/.test(event.key)) {
      event.preventDefault();
      overwriteBoxWithDigit(index, event.key);
      return;
    }
    if (event.key === "Backspace") {
      event.preventDefault();
      deleteDigitBefore(index);
      return;
    }
    if (event.key === "ArrowLeft") focusBox(index - 1);
    if (event.key === "ArrowRight") focusBox(index + 1);
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    const pastedCode = publishCode(event.clipboardData.getData("text"));
    focusBox(pastedCode.length);
  }

  return (
    <div className="flex w-full min-w-0 justify-between gap-2">
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(element) => {
            boxElements.current[index] = element;
          }}
          value={digit.trim()}
          onChange={(event) => handleAutofillOrUntypedInput(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={handlePaste}
          onFocus={(event) => event.target.select()}
          disabled={disabled}
          autoFocus={autoFocus && index === 0}
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          maxLength={1}
          aria-label={String(index + 1)}
          className={cn(
            "aspect-square w-0 min-w-0 max-w-11 flex-1 rounded-md border border-input",
            "bg-transparent text-center font-mono text-sm shadow-sm outline-none transition-colors",
            "focus:border-brand focus:ring-1 focus:ring-brand disabled:opacity-50",
          )}
        />
      ))}
    </div>
  );
}

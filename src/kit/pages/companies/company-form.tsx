export function RequiredMark({ title }: { title: string }) {
  return (
    <span className="text-destructive" title={title} aria-hidden>
      *
    </span>
  );
}

export function FieldErrorText({ text }: { text?: string }) {
  if (!text) return null;
  return <p className="text-xs text-destructive">{text}</p>;
}

export interface CompanyFormValidation {
  code: string;
  name: string;
  errors: Record<string, string>;
}

export function validateCompanyForm(
  input: { code: string; name: string },
  labels: {
    codeRequired: string;
    codeTooLong: string;
    codeInvalidCharacters: string;
    nameRequired: string;
  },
): CompanyFormValidation {
  const code = input.code.trim();
  const name = input.name.trim();
  const errors: Record<string, string> = {};
  if (!code) errors.code = labels.codeRequired;
  else if (code.length > 16) errors.code = labels.codeTooLong;
  else if (!/^[A-Za-z0-9]+$/.test(code)) errors.code = labels.codeInvalidCharacters;
  if (!name) errors.name = labels.nameRequired;
  return { code, name, errors };
}

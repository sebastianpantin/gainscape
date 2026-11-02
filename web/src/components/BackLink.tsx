import { useGoBack } from '../lib/ui/use-go-back.ts';

interface BackLinkProps {
  parent: string;
  label?: string;
  disabled?: boolean;
}

export function BackLink({ parent, label = '‹ Back', disabled = false }: BackLinkProps) {
  const goBack = useGoBack(parent);
  return (
    <button type="button" className="back-link" disabled={disabled} onClick={goBack}>
      {label}
    </button>
  );
}

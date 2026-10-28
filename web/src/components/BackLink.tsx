import { useLocation, useNavigate } from 'react-router-dom';

interface BackLinkProps {
  parent: string;
  label?: string;
  disabled?: boolean;
}

const OPENED_WITHOUT_APP_HISTORY = 'default';

export function BackLink({ parent, label = '‹ Back', disabled = false }: BackLinkProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const cameFromApp = location.key !== OPENED_WITHOUT_APP_HISTORY;
  return (
    <button
      type="button"
      className="back-link"
      disabled={disabled}
      onClick={() => void (cameFromApp ? navigate(-1) : navigate(parent))}
    >
      {label}
    </button>
  );
}

import { useLocation, useNavigate } from 'react-router-dom';

const OPENED_WITHOUT_APP_HISTORY = 'default';

export function useGoBack(parent: string): () => void {
  const navigate = useNavigate();
  const location = useLocation();
  const cameFromApp = location.key !== OPENED_WITHOUT_APP_HISTORY;
  return () => void (cameFromApp ? navigate(-1) : navigate(parent));
}

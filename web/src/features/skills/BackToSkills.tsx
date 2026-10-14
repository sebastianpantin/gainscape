import { Link } from 'react-router-dom';

export function BackToSkills() {
  return (
    <Link className="back-link" to="/skills">
      ‹ Skills
    </Link>
  );
}

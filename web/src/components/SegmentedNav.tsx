import { NavLink } from 'react-router-dom';

interface SegmentedNavProps {
  label: string;
  links: { to: string; label: string }[];
}

export function SegmentedNav({ label, links }: SegmentedNavProps) {
  return (
    <nav className="segmented" aria-label={label}>
      {links.map((link) => (
        <NavLink key={link.to} to={link.to} end className="segment">
          {link.label}
        </NavLink>
      ))}
    </nav>
  );
}

import { BADGE_COLORS, type BadgeColor, initialsFor, TRAINING_FOCUS_LABELS } from '../../lib/profile.ts';
import type { CardProfile } from '../../lib/profile-view.ts';

interface ProfileCardProps {
  profile: CardProfile;
  totalLevel: number | null;
  combatLevel: number | null;
  collectionPercent: number | null;
}

function joinedLabel(createdAt: string): string {
  return `Joined ${new Date(createdAt).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`;
}

function StatTile({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="stat-tile">
      <span className="muted tiny">{label}</span>
      <strong data-testid={testId}>{value}</strong>
    </div>
  );
}

export function ProfileBadge({ color, initials, size = 72 }: { color: BadgeColor; initials: string; size?: number }) {
  const swatch = BADGE_COLORS[color];
  return (
    <span
      className="profile-badge"
      aria-hidden="true"
      data-testid="profile-badge"
      data-color={color}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: swatch.fill,
        boxShadow: `inset 3px 3px 0 ${swatch.light}, inset -3px -3px 0 ${swatch.dark}, 3px 3px 0 #000`,
      }}
    >
      {initials}
    </span>
  );
}

function detailLine(profile: CardProfile): string {
  const parts = [
    profile.trainingSince !== null && `Training since ${profile.trainingSince}`,
    profile.trainingFocus !== null && `${TRAINING_FOCUS_LABELS[profile.trainingFocus]} focus`,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : joinedLabel(profile.createdAt);
}

export function ProfileCard({ profile, totalLevel, combatLevel, collectionPercent }: ProfileCardProps) {
  return (
    <section className="panel stack profile-card" aria-label="Profile">
      <div className="row" style={{ gap: 14 }}>
        <ProfileBadge color={profile.badgeColor} initials={initialsFor(profile.displayName, profile.username)} />
        <div className="stack" style={{ gap: 2, minWidth: 0 }}>
          <h2 className="profile-name">{profile.displayName}</h2>
          <span className="muted">@{profile.username}</span>
          <span className="tiny" data-testid="profile-details">
            {detailLine(profile)}
          </span>
        </div>
      </div>
      {profile.bio && <p data-testid="profile-bio">{profile.bio}</p>}
      <div className="stat-tiles">
        <StatTile label="Total" value={totalLevel === null ? '—' : String(totalLevel)} testId="profile-total" />
        <StatTile label="Combat" value={combatLevel === null ? '—' : String(combatLevel)} testId="profile-combat" />
        <StatTile
          label="Collection"
          value={collectionPercent === null ? '—' : `${collectionPercent}%`}
          testId="profile-collection"
        />
      </div>
    </section>
  );
}

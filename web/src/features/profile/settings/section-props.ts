import { type Profile } from '../../../lib/profile.ts';
import { type ProfileUpdate } from '../use-profile.ts';

export interface SectionProps {
  userId: string;
  profile: Profile;
  onSaved: (update: ProfileUpdate) => void;
}

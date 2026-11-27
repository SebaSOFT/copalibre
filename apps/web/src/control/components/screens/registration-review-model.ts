import { type MessageDescriptor } from 'react-intl';
import type { TeamMemberResponse } from '../../lib/api-client.js';
import { type RegistrationRow, type StatusFilter } from '../../lib/review.js';
import { messages } from '../../i18n/messages.en.js';

export interface ReviewRegistrationRow extends RegistrationRow {
  readonly contactEmail: string;
  readonly teamMembers: readonly string[];
  readonly teamMembersDetailed?: readonly TeamMemberResponse[];
  readonly experience: string;
  readonly requiresCheckIn: boolean;
  readonly checkInClosesAt?: string;
}

export const FILTERS: readonly {
  readonly value: StatusFilter;
  readonly label: MessageDescriptor;
}[] = [
  { value: 'all', label: messages.reviewFilterAll },
  { value: 'pending', label: messages.reviewFilterPending },
  { value: 'accepted', label: messages.reviewFilterAccepted },
  { value: 'refused', label: messages.reviewFilterRefused },
];

export const STATUS_LABELS: Record<RegistrationRow['status'], MessageDescriptor> = {
  pending: messages.reviewStatusPending,
  accepted: messages.reviewStatusAccepted,
  refused: messages.reviewStatusRefused,
  withdrawn: messages.reviewStatusWithdrawn,
  'checked-in': messages.reviewStatusCheckedIn,
};

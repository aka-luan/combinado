export type ChildRow = {
  id: string;
  household_id: string;
  name: string;
  archived_at: string | null;
  active_from: string;
  created_at: string;
  updated_at: string;
};

export type HouseholdMemberRow = {
  household_id: string;
  user_id: string;
  display_name: string;
  archived_at: string | null;
};

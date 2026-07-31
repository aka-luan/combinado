/** Pure planning helper for administrative total Casa deletion (PRD §16). */

export type HouseholdDeletionPlan = {
  confirmationToken: "DELETE_CASA";
  removesHousehold: true;
  invalidatesSessions: true;
  removesSubscriptions: true;
  backupExpiryNote: string;
};

export function planHouseholdDeletion(): HouseholdDeletionPlan {
  return {
    confirmationToken: "DELETE_CASA",
    removesHousehold: true,
    invalidatesSessions: true,
    removesSubscriptions: true,
    backupExpiryNote:
      "Artefatos de backup restantes expiram pela retenção de 7 dias; não há restauração após exclusão total.",
  };
}

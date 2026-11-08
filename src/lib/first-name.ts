/** First word of a display name, for compact UI like the navbar. */
export function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] || displayName;
}

type NamedMember = { id: string; displayName: string };

const firstNameKey = (displayName: string) => firstName(displayName).toLocaleLowerCase();

/**
 * How each family member's name is shown around the app: just their first name,
 * unless another member of the family shares it, in which case the full name
 * keeps them apart.
 */
export function familyDisplayNames(members: NamedMember[]): Record<string, string> {
  const counts = new Map<string, number>();
  for (const member of members) {
    const key = firstNameKey(member.displayName);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries(
    members.map((member) => {
      const shared = (counts.get(firstNameKey(member.displayName)) ?? 0) > 1;
      return [
        member.id,
        shared ? member.displayName.trim() : firstName(member.displayName),
      ];
    }),
  );
}

/** One member's display name among their family (see `familyDisplayNames`). */
export function familyDisplayName(member: NamedMember, family: NamedMember[]): string {
  const members = family.some((m) => m.id === member.id) ? family : [...family, member];
  return familyDisplayNames(members)[member.id] ?? firstName(member.displayName);
}

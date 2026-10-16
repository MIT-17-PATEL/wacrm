/**
 * The signed-in person's first name, as entered (no case changes).
 *
 * Prefers the profile / sign-up name, but skips a value that is really
 * the workspace name — accounts are seeded from the signup name, so the
 * two can collide and the dashboard ended up greeting the workspace.
 * Falls back to the email's local part.
 */
export function personalFirstName({
  metadataName,
  profileName,
  workspaceName,
  email,
}: {
  metadataName?: string | null;
  profileName?: string | null;
  workspaceName?: string | null;
  email?: string | null;
}): string | null {
  const ws = workspaceName?.trim().toLowerCase();
  for (const candidate of [profileName, metadataName]) {
    const v = candidate?.trim();
    if (v && v.toLowerCase() !== ws) return v.split(/\s+/)[0];
  }
  const local = email?.split("@")[0]?.split(/[._+-]/)[0];
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : null;
}

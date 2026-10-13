/**
 * Normalise a custom field name (or a flow variable key) into a
 * comparable placeholder key: "Budget Range" → "budget_range".
 *
 * Shared by the automations engine (`{{contact.<field>}}` placeholders)
 * and the flows engine (saving captured answers onto contact fields),
 * so both agree on which field a name refers to.
 */
export function fieldKey(name: string): string {
  return name.trim().toLowerCase().replace(/[^\p{L}\p{N}_]+/gu, '_')
}

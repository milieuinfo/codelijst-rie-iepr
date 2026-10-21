/**
 * Type declarations for the systeemvelden configuration, so the vitest tests
 * can verify the generated output against the same exclusion list.
 */

export const SYSTEMEN: { sleutel: string; klasse: string }[]

export const LABELS: Record<string, string>

export const UITGESLOTEN: Record<string, string>

export const ENKELVOUDIG: Record<string, string>

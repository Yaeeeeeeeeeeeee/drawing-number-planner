// Additive only: existing template bodies and draft snapshots remain unchanged.
export const schemaVersionTwentyTwo = `
ALTER TABLE outbound_email_templates ADD COLUMN manufacturer TEXT;
ALTER TABLE outbound_email_templates ADD COLUMN scenario TEXT;
`;

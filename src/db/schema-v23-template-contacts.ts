/** Add reviewed recipients and source case history without changing existing mail content. */
export const schemaVersionTwentyThree = `
  ALTER TABLE outbound_email_templates ADD COLUMN contacts_configured INTEGER NOT NULL DEFAULT 0
    CHECK (contacts_configured IN (0, 1));
  ALTER TABLE outbound_email_templates ADD COLUMN import_sources_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(import_sources_json) AND json_type(import_sources_json) = 'array');
  CREATE TABLE outbound_template_contact_links (
    template_id INTEGER NOT NULL REFERENCES outbound_email_templates(id) ON DELETE CASCADE,
    contact_id INTEGER NOT NULL REFERENCES outbound_contacts(id) ON DELETE RESTRICT,
    recipient_type TEXT NOT NULL CHECK (recipient_type IN ('to', 'cc')),
    display_order INTEGER NOT NULL CHECK (typeof(display_order) = 'integer' AND display_order >= 0),
    PRIMARY KEY (template_id, contact_id, recipient_type)
  );
  CREATE INDEX outbound_template_contact_links_contact_idx ON outbound_template_contact_links(contact_id);
`;

// @vitest-environment node
import { expect, it } from 'vitest';
import { openDatabase } from '../../src/db/database';
import { schemaVersionTwentyTwo } from '../../src/db/schema-v22-email';
it('adds optional classification without altering stored template bodies or draft snapshots', () => {
 const db = openDatabase(':memory:');
 try {
 db.exec(`CREATE TABLE outbound_email_templates(id INTEGER PRIMARY KEY, body_template TEXT); CREATE TABLE outbound_email_drafts(id INTEGER PRIMARY KEY, body TEXT); INSERT INTO outbound_email_templates VALUES(1, '{{signature}} old body'); INSERT INTO outbound_email_drafts VALUES(1, 'immutable draft');`);
 db.exec(schemaVersionTwentyTwo);
 expect(db.prepare('select * from outbound_email_templates').get()).toEqual({ id:1, body_template:'{{signature}} old body', manufacturer:null, scenario:null });
 expect(db.prepare('select body from outbound_email_drafts').get()).toEqual({body:'immutable draft'});
 } finally { db.close(); }
});

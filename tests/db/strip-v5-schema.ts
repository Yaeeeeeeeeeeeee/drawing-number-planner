import type { PlannerDatabase } from '../../src/db/database';
import { schemaVersionSeventeen, schemaVersionTwenty } from '../../src/db/schema.sql';
/** Reconstruct pre-V5 fixtures structurally, never just lower their migration ledger. */
export function stripV5Schema(db: PlannerDatabase) {
 for(const table of ['packaging_archive_journal','packaging_pending_files','packaging_task_items','packaging_tasks','packaging_project_configs','packaging_rules','packaging_dimension_products','packaging_dimensions','packaging_templates'])db.exec(`drop table if exists ${table}`);
 for(const column of ['scope_kind','scope_directories_json'])if((db.pragma('table_info(file_scan_runs)') as {name:string}[]).some(c=>c.name===column))db.exec(`alter table file_scan_runs drop column ${column}`);
 db.exec('drop table if exists outbound_template_contact_links');
 const triggers=db.prepare("select name from sqlite_master where type='trigger' and (name like 'force_%' or name like 'drawing_force_release%')").all() as {name:string}[];
 for(const trigger of triggers)db.exec(`drop trigger "${trigger.name}"`);
 const removeEmailColumns=()=>{for(const column of ['manufacturer','scenario','contacts_configured','import_sources_json'])if((db.pragma('table_info(outbound_email_templates)') as {name:string}[]).some(item=>item.name===column))db.exec(`alter table outbound_email_templates drop column ${column}`);};
 db.exec(schemaVersionTwenty);
 const historical=schemaVersionSeventeen.match(/CREATE TRIGGER drawing_usage_historical_update[\s\S]*?END;/)?.[0];
 if(!historical)throw Error('Missing retained historical fixture trigger');
 db.exec('drop trigger drawing_usage_historical_update');db.exec(historical);
 db.exec('drop table if exists drawing_force_release_files; drop table if exists drawing_force_releases');
 removeEmailColumns();
 db.exec('delete from schema_migrations where version>20');
}

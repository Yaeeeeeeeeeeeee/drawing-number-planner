/** Retained task deletion never deletes physical files or historical business references. */
export const schemaVersionTwentyFive=`
 ALTER TABLE packaging_tasks ADD COLUMN deleted_at TEXT;
 ALTER TABLE packaging_tasks ADD COLUMN deletion_snapshot_json TEXT CHECK(deletion_snapshot_json IS NULL OR json_valid(deletion_snapshot_json));
 ALTER TABLE packaging_task_items ADD COLUMN copy_destination_path TEXT;
 DROP INDEX packaging_one_unfinished_task_per_product;
 CREATE UNIQUE INDEX packaging_one_unfinished_task_per_product ON packaging_tasks(product_id) WHERE state<>'completed' AND deleted_at IS NULL;
`;

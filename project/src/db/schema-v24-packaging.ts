/** Additive packaging workflow; old business rows and schema objects are preserved. */
export const schemaVersionTwentyFour = `
  ALTER TABLE file_scan_runs ADD COLUMN scope_kind TEXT NOT NULL DEFAULT 'workspace';
  ALTER TABLE file_scan_runs ADD COLUMN scope_directories_json TEXT NOT NULL DEFAULT '[]';
  CREATE TABLE packaging_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    main_category_id INTEGER NOT NULL REFERENCES dictionary_items(id),
    project_item_id INTEGER NOT NULL REFERENCES dictionary_items(id),
    brand_ids_json TEXT NOT NULL CHECK(json_valid(brand_ids_json)),
    product_ids_json TEXT NOT NULL CHECK(json_valid(product_ids_json)),
    fields_json TEXT NOT NULL CHECK(json_valid(fields_json)),
    required_fonts_json TEXT NOT NULL CHECK(json_valid(required_fonts_json)),
    status TEXT NOT NULL CHECK(status IN ('active','inactive')),
    file_name TEXT NOT NULL, asset_relative_path TEXT NOT NULL, sha256 TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE packaging_dimensions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
    project_item_id INTEGER NOT NULL REFERENCES dictionary_items(id),
    scope TEXT NOT NULL CHECK(scope IN ('specific','shared')),
    parameters_json TEXT NOT NULL CHECK(json_valid(parameters_json)),
    ratio_keys_json TEXT CHECK(ratio_keys_json IS NULL OR json_valid(ratio_keys_json)), ratio REAL,
    status TEXT NOT NULL CHECK(status IN ('active','inactive')), revision INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE packaging_dimension_products (
    profile_id INTEGER NOT NULL REFERENCES packaging_dimensions(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    is_default INTEGER NOT NULL CHECK(is_default IN (0,1)), PRIMARY KEY(profile_id,product_id)
  );
  CREATE TABLE packaging_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,
    template_id INTEGER NOT NULL REFERENCES packaging_templates(id),
    conditions_json TEXT NOT NULL CHECK(json_valid(conditions_json)),
    allow_length_width_swap INTEGER NOT NULL CHECK(allow_length_width_swap IN (0,1)),
    status TEXT NOT NULL CHECK(status IN ('active','inactive'))
  );
  CREATE TABLE packaging_project_configs (
    project_item_id INTEGER PRIMARY KEY REFERENCES dictionary_items(id),
    mode TEXT NOT NULL CHECK(mode IN ('ait','manual','none')),
    parameters_json TEXT NOT NULL CHECK(json_valid(parameters_json))
  );
  CREATE TABLE packaging_tasks (
    id TEXT PRIMARY KEY,product_id INTEGER NOT NULL REFERENCES products(id),
    model_snapshot TEXT NOT NULL,name TEXT NOT NULL,type TEXT NOT NULL CHECK(type IN ('new','modify')),
    state TEXT NOT NULL CHECK(state IN ('active','archiving','awaiting_index','completed')),
    workspace_key TEXT NOT NULL DEFAULT '',
    product_directory TEXT NOT NULL,task_directory TEXT NOT NULL,created_at TEXT NOT NULL,completed_at TEXT,error TEXT,
    owned_files_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(owned_files_json) AND json_type(owned_files_json)='array'),
    index_scan_id INTEGER REFERENCES file_scan_runs(id)
  );
  CREATE UNIQUE INDEX packaging_one_unfinished_task_per_product ON packaging_tasks(product_id) WHERE state<>'completed';
  CREATE TABLE packaging_task_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,task_id TEXT NOT NULL REFERENCES packaging_tasks(id),
    drawing_origin TEXT NOT NULL CHECK(drawing_origin IN ('planned','historical')),drawing_id INTEGER NOT NULL,
    planned_drawing_id INTEGER REFERENCES drawing_numbers(id),historical_drawing_id INTEGER REFERENCES historical_drawing_numbers(id),
    full_code TEXT NOT NULL,project_item_id INTEGER NOT NULL REFERENCES dictionary_items(id),project_name TEXT NOT NULL,color TEXT NOT NULL,
    mode TEXT NOT NULL CHECK(mode IN ('ait','manual','none')),parameters_json TEXT NOT NULL CHECK(json_valid(parameters_json)),
    ratio_locked INTEGER NOT NULL DEFAULT 1 CHECK(ratio_locked IN (0,1)),
    template_id INTEGER REFERENCES packaging_templates(id),dimension_profile_id INTEGER REFERENCES packaging_dimensions(id),template_snapshot_json TEXT CHECK(template_snapshot_json IS NULL OR json_valid(template_snapshot_json)),
    state TEXT NOT NULL CHECK(state IN ('pending','generating','generated','failed','awaiting_upload','awaiting_review','completed','none')),
    error TEXT,reviewed_sha256 TEXT,file_name TEXT,relative_path TEXT,sha256 TEXT,template_name TEXT,
    original_relative_path TEXT,original_sha256 TEXT,backup_relative_path TEXT,
    CHECK((drawing_origin='planned' AND planned_drawing_id=drawing_id AND planned_drawing_id IS NOT NULL AND historical_drawing_id IS NULL)
      OR (drawing_origin='historical' AND historical_drawing_id=drawing_id AND historical_drawing_id IS NOT NULL AND planned_drawing_id IS NULL)),
    UNIQUE(task_id,full_code)
  );
  CREATE TABLE packaging_pending_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,task_id TEXT NOT NULL REFERENCES packaging_tasks(id),
    file_name TEXT NOT NULL,relative_path TEXT NOT NULL,sha256 TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('pending','linked')),reason TEXT NOT NULL,item_id INTEGER REFERENCES packaging_task_items(id),
    UNIQUE(task_id,relative_path)
  );
  CREATE TABLE packaging_archive_journal (
    task_id TEXT NOT NULL REFERENCES packaging_tasks(id),item_id INTEGER PRIMARY KEY REFERENCES packaging_task_items(id),
    source_relative_path TEXT NOT NULL,source_sha256 TEXT NOT NULL,destination_relative_path TEXT NOT NULL,
    original_sha256 TEXT,backup_relative_path TEXT,
    state TEXT NOT NULL CHECK(state IN ('prepared','published','indexed')),created_at TEXT NOT NULL
  );
`;

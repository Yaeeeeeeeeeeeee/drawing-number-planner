export const schemaVersionOne = `
  CREATE TABLE schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  );

  CREATE TABLE dictionary_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    parent_id INTEGER REFERENCES dictionary_items(id),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TEXT NOT NULL,
    deactivated_at TEXT,
    CHECK (
      (type = 'project_item' AND parent_id IS NOT NULL)
      OR (type <> 'project_item' AND parent_id IS NULL)
    )
  );

  CREATE UNIQUE INDEX dictionary_root_code_unique
    ON dictionary_items(type, code)
    WHERE parent_id IS NULL;

  CREATE UNIQUE INDEX dictionary_child_code_unique
    ON dictionary_items(type, parent_id, code)
    WHERE parent_id IS NOT NULL;

  CREATE TABLE products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    brand_id INTEGER NOT NULL REFERENCES dictionary_items(id),
    product_size_id INTEGER NOT NULL REFERENCES dictionary_items(id),
    default_appearance_id INTEGER REFERENCES dictionary_items(id),
    model TEXT NOT NULL,
    product_category TEXT NOT NULL,
    reference_product_id INTEGER REFERENCES products(id),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TEXT NOT NULL,
    deactivated_at TEXT,
    UNIQUE (brand_id, model)
  );

  CREATE TABLE drawing_numbers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_code TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    product_id INTEGER NOT NULL REFERENCES products(id),
    color_id INTEGER NOT NULL REFERENCES dictionary_items(id),
    main_category_id INTEGER NOT NULL REFERENCES dictionary_items(id),
    project_item_id INTEGER NOT NULL REFERENCES dictionary_items(id),
    sequence INTEGER NOT NULL CHECK (sequence BETWEEN 1 AND 999),
    status TEXT NOT NULL CHECK (status IN ('reserved', 'active', 'voided')),
    previous_drawing_id INTEGER REFERENCES drawing_numbers(id),
    change_reason TEXT,
    source_product_id INTEGER REFERENCES products(id),
    source_drawing_id INTEGER REFERENCES drawing_numbers(id),
    created_at TEXT NOT NULL
  );

  INSERT INTO schema_migrations (version, applied_at)
  VALUES (1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
`;

export const schemaVersionTwo = `
  CREATE TABLE drawing_numbers_v2 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_code TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    product_id INTEGER NOT NULL REFERENCES products(id),
    appearance_id INTEGER NOT NULL REFERENCES dictionary_items(id),
    color_id INTEGER NOT NULL REFERENCES dictionary_items(id),
    main_category_id INTEGER NOT NULL REFERENCES dictionary_items(id),
    project_item_id INTEGER NOT NULL REFERENCES dictionary_items(id),
    brand_code TEXT NOT NULL,
    product_size_code TEXT NOT NULL,
    appearance_code TEXT NOT NULL,
    color_code TEXT NOT NULL,
    main_category_code TEXT NOT NULL,
    project_item_code TEXT NOT NULL,
    sequence INTEGER NOT NULL CHECK (sequence BETWEEN 1 AND 999),
    status TEXT NOT NULL CHECK (status IN ('reserved', 'active', 'voided')),
    previous_drawing_id INTEGER REFERENCES drawing_numbers_v2(id),
    change_reason TEXT,
    source_product_id INTEGER REFERENCES products(id),
    source_drawing_id INTEGER REFERENCES drawing_numbers_v2(id),
    notes TEXT,
    created_at TEXT NOT NULL
  );

  INSERT INTO drawing_numbers_v2 (
    id, full_code, display_name, product_id, appearance_id, color_id, main_category_id, project_item_id,
    brand_code, product_size_code, appearance_code, color_code, main_category_code, project_item_code,
    sequence, status, previous_drawing_id, change_reason, source_product_id, source_drawing_id, notes, created_at
  )
  SELECT drawing.id, drawing.full_code, drawing.display_name, drawing.product_id, product.default_appearance_id,
    drawing.color_id, drawing.main_category_id, drawing.project_item_id,
    brand.code, size.code, appearance.code, color.code, main_category.code, project_item.code,
    drawing.sequence, drawing.status, drawing.previous_drawing_id, drawing.change_reason,
    drawing.source_product_id, drawing.source_drawing_id, NULL, drawing.created_at
  FROM drawing_numbers drawing
  JOIN products product ON product.id = drawing.product_id
  JOIN dictionary_items brand ON brand.id = product.brand_id
  JOIN dictionary_items size ON size.id = product.product_size_id
  JOIN dictionary_items appearance ON appearance.id = product.default_appearance_id
  JOIN dictionary_items color ON color.id = drawing.color_id
  JOIN dictionary_items main_category ON main_category.id = drawing.main_category_id
  JOIN dictionary_items project_item ON project_item.id = drawing.project_item_id;

  DROP TABLE drawing_numbers;
  ALTER TABLE drawing_numbers_v2 RENAME TO drawing_numbers;
  INSERT INTO schema_migrations (version, applied_at)
  VALUES (2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
`;

export const schemaVersionThree = `
  CREATE TABLE bom_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id),
    color_id INTEGER NOT NULL REFERENCES dictionary_items(id),
    version_number INTEGER NOT NULL CHECK (version_number > 0),
    previous_version_id INTEGER REFERENCES bom_versions(id),
    notes TEXT,
    created_at TEXT NOT NULL,
    UNIQUE (product_id, color_id, version_number)
  );

  CREATE TABLE bom_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bom_version_id INTEGER NOT NULL REFERENCES bom_versions(id),
    project_item_id INTEGER NOT NULL REFERENCES dictionary_items(id),
    drawing_id INTEGER NOT NULL REFERENCES drawing_numbers(id),
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    notes TEXT,
    uses_white_material INTEGER NOT NULL DEFAULT 0 CHECK (uses_white_material IN (0, 1)),
    UNIQUE (bom_version_id, project_item_id)
  );

  CREATE TABLE bom_current (
    product_id INTEGER NOT NULL REFERENCES products(id),
    color_id INTEGER NOT NULL REFERENCES dictionary_items(id),
    version_id INTEGER NOT NULL UNIQUE REFERENCES bom_versions(id),
    updated_at TEXT NOT NULL,
    PRIMARY KEY (product_id, color_id)
  );

  INSERT INTO schema_migrations (version, applied_at)
  VALUES (3, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
`;

export const schemaVersionFour = `
  CREATE TABLE pdf_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    relative_path TEXT NOT NULL UNIQUE CHECK (
      length(relative_path) > 0
      AND
      substr(relative_path, 1, 1) NOT IN ('/', '\\')
      AND relative_path NOT GLOB '[A-Za-z]:*'
      AND relative_path NOT IN ('.', '..')
      AND relative_path NOT LIKE '../%'
      AND relative_path NOT LIKE '..\\%'
      AND relative_path NOT LIKE '%/../%'
      AND relative_path NOT LIKE '%\\..\\%'
      AND relative_path NOT LIKE '%/..'
      AND relative_path NOT LIKE '%\\..'
    ),
    file_name TEXT NOT NULL,
    drawing_id INTEGER REFERENCES drawing_numbers(id),
    match_status TEXT NOT NULL CHECK (match_status IN ('matched', 'unmatched', 'conflict')),
    detected_codes_json TEXT NOT NULL DEFAULT '[]',
    conversion_type TEXT NOT NULL CHECK (conversion_type IN ('source', 'outlined')),
    size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
    modified_at TEXT NOT NULL,
    scanned_at TEXT NOT NULL,
    is_present INTEGER NOT NULL DEFAULT 1 CHECK (is_present IN (0, 1)),
    CHECK (
      (match_status = 'matched' AND drawing_id IS NOT NULL)
      OR (match_status <> 'matched' AND drawing_id IS NULL)
    )
  );

  CREATE INDEX pdf_files_drawing_idx ON pdf_files(drawing_id);
  CREATE INDEX pdf_files_filter_idx ON pdf_files(is_present, match_status, conversion_type);

  INSERT INTO schema_migrations (version, applied_at)
  VALUES (4, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
`;

export const schemaVersionFive = `
  CREATE UNIQUE INDEX IF NOT EXISTS products_sku_unique
    ON products(sku COLLATE NOCASE)
    WHERE sku IS NOT NULL AND length(trim(sku)) > 0;

  CREATE TABLE historical_drawing_numbers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_code TEXT NOT NULL UNIQUE,
    brand_code TEXT NOT NULL CHECK (length(brand_code) = 2),
    product_size_code TEXT NOT NULL CHECK (length(product_size_code) = 4),
    appearance_code TEXT NOT NULL CHECK (length(appearance_code) = 2),
    color_code TEXT NOT NULL CHECK (length(color_code) = 1),
    main_category_code TEXT NOT NULL CHECK (length(main_category_code) = 2),
    project_item_code TEXT NOT NULL CHECK (length(project_item_code) = 2),
    sequence INTEGER NOT NULL CHECK (sequence BETWEEN 1 AND 999),
    product_id INTEGER REFERENCES products(id),
    detected_sku TEXT,
    detected_model TEXT,
    detected_product_category TEXT,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL
  );

  CREATE INDEX historical_drawing_prefix_idx ON historical_drawing_numbers (
    brand_code, product_size_code, appearance_code, color_code, main_category_code, project_item_code, sequence
  );

  ALTER TABLE pdf_files RENAME TO pdf_files_v4;

  CREATE TABLE pdf_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    relative_path TEXT NOT NULL UNIQUE CHECK (
      length(relative_path) > 0
      AND substr(relative_path, 1, 1) NOT IN ('/', '\\')
      AND relative_path NOT GLOB '[A-Za-z]:*'
      AND relative_path NOT IN ('.', '..')
      AND relative_path NOT LIKE '../%'
      AND relative_path NOT LIKE '..\\%'
      AND relative_path NOT LIKE '%/../%'
      AND relative_path NOT LIKE '%\\..\\%'
      AND relative_path NOT LIKE '%/..'
      AND relative_path NOT LIKE '%\\..'
    ),
    file_name TEXT NOT NULL,
    drawing_id INTEGER REFERENCES drawing_numbers(id),
    historical_drawing_id INTEGER REFERENCES historical_drawing_numbers(id),
    match_status TEXT NOT NULL CHECK (match_status IN ('matched', 'pending', 'unmatched', 'conflict')),
    detected_codes_json TEXT NOT NULL DEFAULT '[]',
    conversion_type TEXT NOT NULL CHECK (conversion_type IN ('source', 'outlined')),
    classification_warning TEXT,
    size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
    modified_at TEXT NOT NULL,
    scanned_at TEXT NOT NULL,
    is_present INTEGER NOT NULL DEFAULT 1 CHECK (is_present IN (0, 1)),
    CHECK (
      (match_status = 'matched' AND ((drawing_id IS NOT NULL) <> (historical_drawing_id IS NOT NULL)))
      OR (match_status <> 'matched' AND drawing_id IS NULL AND historical_drawing_id IS NULL)
    )
  );

  INSERT INTO pdf_files (
    id, relative_path, file_name, drawing_id, historical_drawing_id, match_status,
    detected_codes_json, conversion_type, classification_warning, size_bytes,
    modified_at, scanned_at, is_present
  )
  SELECT id, relative_path, file_name, drawing_id, NULL, match_status,
    detected_codes_json, conversion_type, NULL, size_bytes, modified_at, scanned_at, is_present
  FROM pdf_files_v4;

  DROP TABLE pdf_files_v4;
  CREATE INDEX pdf_files_drawing_idx ON pdf_files(drawing_id);
  CREATE INDEX pdf_files_historical_drawing_idx ON pdf_files(historical_drawing_id);
  CREATE INDEX pdf_files_filter_idx ON pdf_files(is_present, match_status, conversion_type);

  INSERT INTO schema_migrations (version, applied_at)
  VALUES (5, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
`;

export const schemaVersionSix = `
  CREATE TABLE material_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    relative_path TEXT NOT NULL UNIQUE,
    product_directory TEXT NOT NULL,
    product_id INTEGER REFERENCES products(id),
    detected_product_category TEXT,
    detected_sku TEXT,
    detected_model TEXT,
    name TEXT NOT NULL,
    sequence_number INTEGER,
    business_date TEXT,
    recognition_status TEXT NOT NULL CHECK (recognition_status IN ('recognized', 'pending')),
    classification_warning TEXT,
    is_present INTEGER NOT NULL DEFAULT 1 CHECK (is_present IN (0, 1)),
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL
  );

  CREATE INDEX material_batches_product_sequence_idx
    ON material_batches(product_directory, sequence_number);
  CREATE INDEX material_batches_product_id_idx ON material_batches(product_id);

  ALTER TABLE pdf_files ADD COLUMN path_key TEXT;
  ALTER TABLE pdf_files ADD COLUMN material_batch_id INTEGER REFERENCES material_batches(id);
`;

export const schemaVersionSeven = `
  CREATE TABLE file_scan_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT NOT NULL,
    completed_at TEXT NOT NULL,
    total_current INTEGER NOT NULL DEFAULT 0 CHECK (total_current >= 0),
    added_count INTEGER NOT NULL DEFAULT 0 CHECK (added_count >= 0),
    missing_count INTEGER NOT NULL DEFAULT 0 CHECK (missing_count >= 0),
    moved_count INTEGER NOT NULL DEFAULT 0 CHECK (moved_count >= 0),
    changed_count INTEGER NOT NULL DEFAULT 0 CHECK (changed_count >= 0),
    unchanged_count INTEGER NOT NULL DEFAULT 0 CHECK (unchanged_count >= 0)
  );

  CREATE TABLE file_scan_changes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_run_id INTEGER NOT NULL REFERENCES file_scan_runs(id) ON DELETE CASCADE,
    change_type TEXT NOT NULL CHECK (change_type IN ('added', 'missing', 'moved', 'changed', 'unchanged')),
    index_kind TEXT NOT NULL CHECK (index_kind IN ('pdf', 'qr')),
    file_index_id INTEGER NOT NULL,
    relative_path TEXT NOT NULL,
    previous_relative_path TEXT,
    file_name TEXT NOT NULL,
    full_code TEXT
  );

  CREATE INDEX file_scan_changes_scan_run_idx ON file_scan_changes(scan_run_id);
  CREATE INDEX file_scan_changes_index_kind_idx ON file_scan_changes(index_kind, file_index_id);

  ALTER TABLE pdf_files ADD COLUMN content_sha256 TEXT;
  ALTER TABLE pdf_files ADD COLUMN last_seen_scan_run_id INTEGER REFERENCES file_scan_runs(id);
  CREATE INDEX pdf_files_last_seen_scan_run_idx ON pdf_files(last_seen_scan_run_id);

  ALTER TABLE material_batches ADD COLUMN last_seen_scan_run_id INTEGER REFERENCES file_scan_runs(id);
  CREATE INDEX material_batches_last_seen_scan_run_idx ON material_batches(last_seen_scan_run_id);

  ALTER TABLE historical_drawing_numbers ADD COLUMN status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive'));
`;

export const schemaVersionEight = `
  CREATE TABLE qr_purposes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    english_name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    default_for_all INTEGER NOT NULL DEFAULT 0 CHECK (default_for_all IN (0, 1)),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE qr_purpose_product_categories (
    purpose_id INTEGER NOT NULL REFERENCES qr_purposes(id) ON DELETE CASCADE,
    product_category TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (purpose_id, product_category)
  );

  CREATE TABLE product_qr_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id),
    purpose_id INTEGER NOT NULL REFERENCES qr_purposes(id),
    name TEXT NOT NULL,
    target_url TEXT,
    status TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'inactive')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (product_id, purpose_id)
  );

  CREATE INDEX product_qr_codes_product_idx ON product_qr_codes(product_id);
  CREATE INDEX product_qr_codes_purpose_idx ON product_qr_codes(purpose_id);

  CREATE TABLE qr_code_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    relative_path TEXT NOT NULL UNIQUE CHECK (
      length(relative_path) > 0
      AND substr(relative_path, 1, 1) NOT IN ('/', '\\')
      AND relative_path NOT GLOB '[A-Za-z]:*'
      AND relative_path NOT IN ('.', '..')
      AND relative_path NOT LIKE '../%'
      AND relative_path NOT LIKE '..\\%'
      AND relative_path NOT LIKE '%/../%'
      AND relative_path NOT LIKE '%\\..\\%'
      AND relative_path NOT LIKE '%/..'
      AND relative_path NOT LIKE '%\\..'
    ),
    path_key TEXT NOT NULL UNIQUE,
    file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
    modified_at TEXT NOT NULL,
    content_sha256 TEXT,
    qr_code_id INTEGER REFERENCES product_qr_codes(id) ON DELETE RESTRICT,
    match_status TEXT NOT NULL CHECK (match_status IN ('matched', 'pending', 'unmatched')),
    classification_warning TEXT,
    is_present INTEGER NOT NULL DEFAULT 1 CHECK (is_present IN (0, 1)),
    last_seen_scan_run_id INTEGER REFERENCES file_scan_runs(id),
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    CHECK (
      (match_status = 'matched' AND qr_code_id IS NOT NULL)
      OR (match_status <> 'matched' AND qr_code_id IS NULL)
    )
  );

  CREATE INDEX qr_code_files_qr_code_idx ON qr_code_files(qr_code_id);
  CREATE INDEX qr_code_files_last_seen_scan_run_idx ON qr_code_files(last_seen_scan_run_id);

  INSERT INTO qr_purposes (
    key, english_name, display_name, default_for_all, status, created_at, updated_at
  ) VALUES
    ('user_manual', 'User Manual', '说明书二维码', 1, 'active', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    ('warranty', 'Warranty', '售后二维码', 1, 'active', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    ('recipe', 'Recipe', '菜谱二维码', 0, 'active', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

  INSERT INTO qr_purpose_product_categories (purpose_id, product_category, created_at)
  SELECT id, '空气炸锅', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  FROM qr_purposes
  WHERE key = 'recipe';

  INSERT INTO product_qr_codes (
    product_id, purpose_id, name, target_url, status, created_at, updated_at
  )
  SELECT product.id, purpose.id, purpose.english_name, NULL, 'inactive',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  FROM products product
  JOIN qr_purposes purpose ON purpose.default_for_all = 1
    OR EXISTS (
      SELECT 1 FROM qr_purpose_product_categories mapping
      WHERE mapping.purpose_id = purpose.id
        AND mapping.product_category = product.product_category
    );
`;

export const schemaVersionNine = `
  CREATE TABLE bom_versions_v9 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id),
    version_number INTEGER NOT NULL CHECK (version_number > 0),
    previous_version_id INTEGER REFERENCES bom_versions_v9(id),
    business_change_date TEXT,
    legacy_color_id INTEGER REFERENCES dictionary_items(id),
    notes TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE bom_items_v9 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bom_version_id INTEGER NOT NULL REFERENCES bom_versions_v9(id),
    project_item_id INTEGER NOT NULL REFERENCES dictionary_items(id),
    drawing_id INTEGER NOT NULL REFERENCES drawing_numbers(id),
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    effective_batch_relative_path TEXT,
    effective_batch_name TEXT,
    effective_material_batch_id INTEGER REFERENCES material_batches(id) ON DELETE SET NULL,
    material TEXT,
    dimensions TEXT,
    position TEXT,
    notes TEXT,
    uses_white_material INTEGER NOT NULL DEFAULT 0 CHECK (uses_white_material IN (0, 1)),
    UNIQUE (bom_version_id, project_item_id)
  );

  CREATE TABLE bom_current_v9 (
    product_id INTEGER PRIMARY KEY REFERENCES products(id),
    version_id INTEGER NOT NULL UNIQUE REFERENCES bom_versions_v9(id),
    updated_at TEXT NOT NULL
  );

  CREATE TABLE bom_assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    relative_path TEXT NOT NULL UNIQUE CHECK (
      length(relative_path) > 0
      AND substr(relative_path, 1, 1) NOT IN ('/', '\\')
      AND relative_path NOT GLOB '[A-Za-z]:*'
      AND relative_path NOT IN ('.', '..')
      AND relative_path NOT LIKE '../%'
      AND relative_path NOT LIKE '..\\%'
      AND relative_path NOT LIKE '%/../%'
      AND relative_path NOT LIKE '%\\..\\%'
      AND relative_path NOT LIKE '%/..'
      AND relative_path NOT LIKE '%\\..'
      AND replace(relative_path, '\\', '/') NOT LIKE '../%'
      AND replace(relative_path, '\\', '/') NOT LIKE '%/../%'
      AND replace(relative_path, '\\', '/') NOT LIKE '%/..'
    ),
    original_file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
    content_sha256 TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE bom_item_assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bom_item_id INTEGER NOT NULL REFERENCES bom_items_v9(id) ON DELETE CASCADE,
    asset_id INTEGER NOT NULL REFERENCES bom_assets(id) ON DELETE RESTRICT,
    role TEXT NOT NULL CHECK (role IN ('image', 'diagram')),
    inherited_from_bom_item_asset_id INTEGER REFERENCES bom_item_assets(id) ON DELETE RESTRICT,
    UNIQUE (bom_item_id, role)
  );

  CREATE TABLE bom_item_qr_codes (
    bom_item_id INTEGER NOT NULL REFERENCES bom_items_v9(id) ON DELETE CASCADE,
    qr_code_id INTEGER NOT NULL REFERENCES product_qr_codes(id) ON DELETE RESTRICT,
    PRIMARY KEY (bom_item_id, qr_code_id)
  );

  INSERT INTO bom_versions_v9 (
    id, product_id, version_number, previous_version_id, business_change_date, legacy_color_id, notes, created_at
  )
  SELECT id, product_id, version_number, previous_version_id, NULL, color_id, notes, created_at
  FROM bom_versions;

  INSERT INTO bom_items_v9 (
    id, bom_version_id, project_item_id, drawing_id, quantity, effective_batch_relative_path,
    effective_batch_name, effective_material_batch_id, material, dimensions, position, notes, uses_white_material
  )
  SELECT id, bom_version_id, project_item_id, drawing_id, quantity, NULL, NULL, NULL, NULL, NULL, NULL, notes,
    uses_white_material
  FROM bom_items;

  INSERT INTO bom_current_v9 (product_id, version_id, updated_at)
  SELECT product_id, version_id, updated_at
  FROM bom_current;

  DROP TABLE bom_current;
  DROP TABLE bom_items;
  DROP TABLE bom_versions;
  ALTER TABLE bom_versions_v9 RENAME TO bom_versions;
  ALTER TABLE bom_items_v9 RENAME TO bom_items;
  ALTER TABLE bom_current_v9 RENAME TO bom_current;

  CREATE INDEX bom_items_effective_material_batch_idx ON bom_items(effective_material_batch_id);
  CREATE INDEX bom_item_assets_asset_idx ON bom_item_assets(asset_id);
  CREATE INDEX bom_item_qr_codes_qr_code_idx ON bom_item_qr_codes(qr_code_id);

  CREATE TRIGGER bom_assets_relative_path_guard_insert
  BEFORE INSERT ON bom_assets
  WHEN length(NEW.relative_path) = 0
    OR substr(NEW.relative_path, 1, 1) IN ('/', '\\')
    OR NEW.relative_path GLOB '[A-Za-z]:*'
    OR NEW.relative_path IN ('.', '..')
    OR replace(NEW.relative_path, '\\', '/') LIKE '../%'
    OR replace(NEW.relative_path, '\\', '/') LIKE '%/../%'
    OR replace(NEW.relative_path, '\\', '/') LIKE '%/..'
  BEGIN
    SELECT RAISE(ABORT, 'BOM 附件路径必须是工作区相对路径');
  END;

  CREATE TRIGGER bom_assets_relative_path_guard_update
  BEFORE UPDATE OF relative_path ON bom_assets
  WHEN length(NEW.relative_path) = 0
    OR substr(NEW.relative_path, 1, 1) IN ('/', '\\')
    OR NEW.relative_path GLOB '[A-Za-z]:*'
    OR NEW.relative_path IN ('.', '..')
    OR replace(NEW.relative_path, '\\', '/') LIKE '../%'
    OR replace(NEW.relative_path, '\\', '/') LIKE '%/../%'
    OR replace(NEW.relative_path, '\\', '/') LIKE '%/..'
  BEGIN
    SELECT RAISE(ABORT, 'BOM 附件路径必须是工作区相对路径');
  END;

  CREATE TRIGGER bom_item_assets_inherited_source_guard_insert
  BEFORE INSERT ON bom_item_assets
  WHEN NEW.inherited_from_bom_item_asset_id IS NOT NULL
  BEGIN
    SELECT CASE WHEN NOT EXISTS (
      SELECT 1
      FROM bom_items destination_item
      JOIN bom_versions destination_version ON destination_version.id = destination_item.bom_version_id
      JOIN bom_item_assets source_asset ON source_asset.id = NEW.inherited_from_bom_item_asset_id
      JOIN bom_items source_item ON source_item.id = source_asset.bom_item_id
      JOIN bom_versions source_version ON source_version.id = source_item.bom_version_id
      WHERE destination_item.id = NEW.bom_item_id
        AND source_asset.id <> NEW.id
        AND source_asset.asset_id = NEW.asset_id
        AND source_asset.role = NEW.role
        AND destination_version.previous_version_id = source_version.id
        AND destination_version.product_id = source_version.product_id
        AND destination_item.project_item_id = source_item.project_item_id
    ) THEN RAISE(ABORT, 'BOM 沿用附件必须来自上一版对应项目') END;
  END;

  CREATE TRIGGER bom_item_assets_inherited_source_guard_update
  BEFORE UPDATE OF bom_item_id, asset_id, role, inherited_from_bom_item_asset_id ON bom_item_assets
  WHEN NEW.inherited_from_bom_item_asset_id IS NOT NULL
  BEGIN
    SELECT CASE WHEN NOT EXISTS (
      SELECT 1
      FROM bom_items destination_item
      JOIN bom_versions destination_version ON destination_version.id = destination_item.bom_version_id
      JOIN bom_item_assets source_asset ON source_asset.id = NEW.inherited_from_bom_item_asset_id
      JOIN bom_items source_item ON source_item.id = source_asset.bom_item_id
      JOIN bom_versions source_version ON source_version.id = source_item.bom_version_id
      WHERE destination_item.id = NEW.bom_item_id
        AND source_asset.id <> NEW.id
        AND source_asset.asset_id = NEW.asset_id
        AND source_asset.role = NEW.role
        AND destination_version.previous_version_id = source_version.id
        AND destination_version.product_id = source_version.product_id
        AND destination_item.project_item_id = source_item.project_item_id
    ) THEN RAISE(ABORT, 'BOM 沿用附件必须来自上一版对应项目') END;
  END;

  CREATE TRIGGER bom_item_assets_source_dependency_guard
  BEFORE UPDATE OF bom_item_id, asset_id, role ON bom_item_assets
  WHEN EXISTS (
    SELECT 1
    FROM bom_item_assets destination_asset
    JOIN bom_items destination_item ON destination_item.id = destination_asset.bom_item_id
    JOIN bom_versions destination_version ON destination_version.id = destination_item.bom_version_id
    JOIN bom_items new_source_item ON new_source_item.id = NEW.bom_item_id
    JOIN bom_versions new_source_version ON new_source_version.id = new_source_item.bom_version_id
    WHERE destination_asset.inherited_from_bom_item_asset_id = OLD.id
      AND (NEW.asset_id <> destination_asset.asset_id
        OR NEW.role <> destination_asset.role
        OR destination_version.previous_version_id IS NOT new_source_version.id
        OR destination_version.product_id <> new_source_version.product_id
        OR destination_item.project_item_id <> new_source_item.project_item_id)
  )
  BEGIN
    SELECT RAISE(ABORT, 'BOM 沿用附件必须来自上一版对应项目');
  END;

  CREATE TRIGGER bom_items_inheritance_dependency_guard
  BEFORE UPDATE OF bom_version_id, project_item_id ON bom_items
  WHEN EXISTS (
    SELECT 1
    FROM bom_item_assets destination_asset
    JOIN bom_versions new_destination_version ON new_destination_version.id = NEW.bom_version_id
    JOIN bom_item_assets source_asset ON source_asset.id = destination_asset.inherited_from_bom_item_asset_id
    JOIN bom_items source_item ON source_item.id = source_asset.bom_item_id
    JOIN bom_versions source_version ON source_version.id = source_item.bom_version_id
    WHERE destination_asset.bom_item_id = OLD.id
      AND destination_asset.inherited_from_bom_item_asset_id IS NOT NULL
      AND (new_destination_version.previous_version_id IS NOT source_version.id
        OR new_destination_version.product_id <> source_version.product_id
        OR NEW.project_item_id <> source_item.project_item_id)
  ) OR EXISTS (
    SELECT 1
    FROM bom_item_assets destination_asset
    JOIN bom_items destination_item ON destination_item.id = destination_asset.bom_item_id
    JOIN bom_versions destination_version ON destination_version.id = destination_item.bom_version_id
    JOIN bom_item_assets source_asset ON source_asset.id = destination_asset.inherited_from_bom_item_asset_id
    WHERE source_asset.bom_item_id = OLD.id
      AND (destination_version.previous_version_id IS NOT NEW.bom_version_id
        OR destination_version.product_id <> (SELECT product_id FROM bom_versions WHERE id = NEW.bom_version_id)
        OR destination_item.project_item_id <> NEW.project_item_id)
  )
  BEGIN
    SELECT RAISE(ABORT, 'BOM 沿用附件必须来自上一版对应项目');
  END;

  CREATE TRIGGER bom_item_qr_codes_same_product_insert
  BEFORE INSERT ON bom_item_qr_codes
  BEGIN
    SELECT CASE WHEN NOT EXISTS (
      SELECT 1
      FROM bom_items item
      JOIN bom_versions version ON version.id = item.bom_version_id
      JOIN product_qr_codes qr ON qr.id = NEW.qr_code_id
      WHERE item.id = NEW.bom_item_id AND version.product_id = qr.product_id
    ) THEN RAISE(ABORT, 'BOM 项目只能关联同产品二维码') END;
  END;

  CREATE TRIGGER bom_item_qr_codes_same_product_update
  BEFORE UPDATE OF bom_item_id, qr_code_id ON bom_item_qr_codes
  BEGIN
    SELECT CASE WHEN NOT EXISTS (
      SELECT 1
      FROM bom_items item
      JOIN bom_versions version ON version.id = item.bom_version_id
      JOIN product_qr_codes qr ON qr.id = NEW.qr_code_id
      WHERE item.id = NEW.bom_item_id AND version.product_id = qr.product_id
    ) THEN RAISE(ABORT, 'BOM 项目只能关联同产品二维码') END;
  END;

  CREATE TRIGGER product_qr_codes_bom_link_product_guard
  BEFORE UPDATE OF product_id ON product_qr_codes
  WHEN EXISTS (
    SELECT 1
    FROM bom_item_qr_codes link
    JOIN bom_items item ON item.id = link.bom_item_id
    JOIN bom_versions version ON version.id = item.bom_version_id
    WHERE link.qr_code_id = OLD.id AND version.product_id <> NEW.product_id
  )
  BEGIN
    SELECT RAISE(ABORT, 'BOM 项目只能关联同产品二维码');
  END;

  CREATE TRIGGER bom_items_qr_product_guard
  BEFORE UPDATE OF bom_version_id ON bom_items
  WHEN EXISTS (
    SELECT 1
    FROM bom_item_qr_codes link
    JOIN product_qr_codes qr ON qr.id = link.qr_code_id
    JOIN bom_versions version ON version.id = NEW.bom_version_id
    WHERE link.bom_item_id = OLD.id AND qr.product_id <> version.product_id
  )
  BEGIN
    SELECT RAISE(ABORT, 'BOM 项目只能关联同产品二维码');
  END;

  CREATE TRIGGER bom_current_product_guard_insert
  BEFORE INSERT ON bom_current
  WHEN NOT EXISTS (
    SELECT 1 FROM bom_versions version
    WHERE version.id = NEW.version_id AND version.product_id = NEW.product_id
  )
  BEGIN
    SELECT RAISE(ABORT, 'BOM 当前版本必须属于当前产品');
  END;

  CREATE TRIGGER bom_current_product_guard_update
  BEFORE UPDATE OF product_id, version_id ON bom_current
  WHEN NOT EXISTS (
    SELECT 1 FROM bom_versions version
    WHERE version.id = NEW.version_id AND version.product_id = NEW.product_id
  )
  BEGIN
    SELECT RAISE(ABORT, 'BOM 当前版本必须属于当前产品');
  END;

  CREATE TRIGGER bom_versions_product_guard
  BEFORE UPDATE OF product_id ON bom_versions
  WHEN EXISTS (
    SELECT 1 FROM bom_current current WHERE current.version_id = OLD.id AND current.product_id <> NEW.product_id
  ) OR EXISTS (
    SELECT 1
    FROM bom_items item
    JOIN bom_item_qr_codes link ON link.bom_item_id = item.id
    JOIN product_qr_codes qr ON qr.id = link.qr_code_id
    WHERE item.bom_version_id = OLD.id AND qr.product_id <> NEW.product_id
  ) OR EXISTS (
    SELECT 1
    FROM bom_item_assets destination_asset
    JOIN bom_items destination_item ON destination_item.id = destination_asset.bom_item_id
    JOIN bom_versions destination_version ON destination_version.id = destination_item.bom_version_id
    JOIN bom_item_assets source_asset ON source_asset.id = destination_asset.inherited_from_bom_item_asset_id
    JOIN bom_items source_item ON source_item.id = source_asset.bom_item_id
    JOIN bom_versions source_version ON source_version.id = source_item.bom_version_id
    WHERE (destination_version.id = OLD.id AND source_version.product_id <> NEW.product_id)
       OR (source_version.id = OLD.id AND destination_version.product_id <> NEW.product_id)
  )
  BEGIN
    SELECT RAISE(ABORT, 'BOM 版本产品变更会破坏现有关联');
  END;

  CREATE TRIGGER bom_versions_previous_version_guard
  BEFORE UPDATE OF previous_version_id ON bom_versions
  WHEN EXISTS (
    SELECT 1
    FROM bom_item_assets destination_asset
    JOIN bom_items destination_item ON destination_item.id = destination_asset.bom_item_id
    JOIN bom_item_assets source_asset ON source_asset.id = destination_asset.inherited_from_bom_item_asset_id
    JOIN bom_items source_item ON source_item.id = source_asset.bom_item_id
    WHERE destination_item.bom_version_id = OLD.id AND source_item.bom_version_id IS NOT NEW.previous_version_id
  )
  BEGIN
    SELECT RAISE(ABORT, 'BOM 沿用附件必须来自上一版对应项目');
  END;

  CREATE TRIGGER bom_versions_predecessor_graph_guard_insert
  BEFORE INSERT ON bom_versions
  WHEN NEW.previous_version_id IS NOT NULL AND (
    NEW.previous_version_id = NEW.id
    OR NOT EXISTS (
      SELECT 1 FROM bom_versions previous_version
      WHERE previous_version.id = NEW.previous_version_id
        AND previous_version.product_id = NEW.product_id
    )
    OR EXISTS (
      WITH RECURSIVE predecessors(id) AS (
        SELECT NEW.previous_version_id
        UNION
        SELECT version.previous_version_id
        FROM bom_versions version
        JOIN predecessors ON predecessors.id = version.id
        WHERE version.previous_version_id IS NOT NULL
      )
      SELECT 1 FROM predecessors WHERE id = NEW.id
    )
  )
  BEGIN
    SELECT RAISE(ABORT, 'BOM 前序版本必须属于同产品且不能形成循环');
  END;

  CREATE TRIGGER bom_versions_predecessor_graph_guard_update
  BEFORE UPDATE OF previous_version_id, product_id ON bom_versions
  WHEN NEW.previous_version_id IS NOT NULL AND (
    NEW.previous_version_id = NEW.id
    OR NOT EXISTS (
      SELECT 1 FROM bom_versions previous_version
      WHERE previous_version.id = NEW.previous_version_id
        AND previous_version.product_id = NEW.product_id
    )
    OR EXISTS (
      WITH RECURSIVE predecessors(id) AS (
        SELECT NEW.previous_version_id
        UNION
        SELECT version.previous_version_id
        FROM bom_versions version
        JOIN predecessors ON predecessors.id = version.id
        WHERE version.previous_version_id IS NOT NULL
      )
      SELECT 1 FROM predecessors WHERE id = NEW.id
    )
  )
  BEGIN
    SELECT RAISE(ABORT, 'BOM 前序版本必须属于同产品且不能形成循环');
  END;

  CREATE TRIGGER bom_versions_predecessor_child_product_guard
  BEFORE UPDATE OF product_id ON bom_versions
  WHEN EXISTS (
    SELECT 1 FROM bom_versions child_version
    WHERE child_version.previous_version_id = OLD.id
      AND child_version.product_id IS NOT NEW.product_id
  )
  BEGIN
    SELECT RAISE(ABORT, 'BOM 前序版本必须属于同产品且不能形成循环');
  END;
`;

export const schemaVersionTen = `
  ALTER TABLE bom_versions ADD COLUMN deleted_at TEXT;
  ALTER TABLE bom_versions ADD COLUMN deleted_reason TEXT;
  ALTER TABLE qr_code_files ADD COLUMN detected_identifier TEXT;

  PRAGMA defer_foreign_keys = ON;

  CREATE TEMP TABLE bom_item_assets_v10_backup AS
  SELECT id, bom_item_id, asset_id, role, inherited_from_bom_item_asset_id
  FROM bom_item_assets;

  CREATE TEMP TABLE bom_item_qr_codes_v10_backup AS
  SELECT bom_item_id, qr_code_id
  FROM bom_item_qr_codes;

  CREATE TABLE bom_items_v10 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bom_version_id INTEGER NOT NULL REFERENCES bom_versions(id),
    project_item_id INTEGER NOT NULL REFERENCES dictionary_items(id),
    drawing_id INTEGER REFERENCES drawing_numbers(id),
    historical_drawing_id INTEGER REFERENCES historical_drawing_numbers(id),
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    effective_batch_relative_path TEXT,
    effective_batch_name TEXT,
    effective_material_batch_id INTEGER REFERENCES material_batches(id) ON DELETE SET NULL,
    material TEXT,
    dimensions TEXT,
    position TEXT,
    notes TEXT,
    uses_white_material INTEGER NOT NULL DEFAULT 0 CHECK (uses_white_material IN (0, 1)),
    UNIQUE (bom_version_id, project_item_id),
    CHECK ((drawing_id IS NOT NULL) <> (historical_drawing_id IS NOT NULL))
  );

  INSERT INTO bom_items_v10 (
    id, bom_version_id, project_item_id, drawing_id, historical_drawing_id, quantity,
    effective_batch_relative_path, effective_batch_name, effective_material_batch_id,
    material, dimensions, position, notes, uses_white_material
  )
  SELECT id, bom_version_id, project_item_id, drawing_id, NULL, quantity,
    effective_batch_relative_path, effective_batch_name, effective_material_batch_id,
    material, dimensions, position, notes, uses_white_material
  FROM bom_items;

  DROP TABLE bom_items;
  ALTER TABLE bom_items_v10 RENAME TO bom_items;

  INSERT INTO bom_item_assets (id, bom_item_id, asset_id, role, inherited_from_bom_item_asset_id)
  SELECT id, bom_item_id, asset_id, role, inherited_from_bom_item_asset_id
  FROM bom_item_assets_v10_backup
  ORDER BY id;

  INSERT INTO bom_item_qr_codes (bom_item_id, qr_code_id)
  SELECT bom_item_id, qr_code_id
  FROM bom_item_qr_codes_v10_backup;

  DROP TABLE bom_item_assets_v10_backup;
  DROP TABLE bom_item_qr_codes_v10_backup;

  CREATE INDEX bom_items_effective_material_batch_idx ON bom_items(effective_material_batch_id);
  CREATE INDEX bom_items_historical_drawing_idx ON bom_items(historical_drawing_id);
`;

export const schemaVersionEleven = `
  CREATE TABLE outbound_contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company TEXT NOT NULL CHECK (length(trim(company)) > 0),
    contact_name TEXT NOT NULL CHECK (length(trim(contact_name)) > 0),
    email TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(trim(email)) > 0),
    default_recipient_type TEXT NOT NULL CHECK (default_recipient_type IN ('to', 'cc')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE outbound_email_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE CHECK (length(trim(key)) > 0),
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    material_type TEXT NOT NULL CHECK (material_type IN ('initial', 'update')),
    subject_template TEXT NOT NULL CHECK (length(trim(subject_template)) > 0),
    body_template TEXT NOT NULL CHECK (length(trim(body_template)) > 0),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE outbound_template_blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id INTEGER NOT NULL REFERENCES outbound_email_templates(id) ON DELETE CASCADE,
    key TEXT NOT NULL CHECK (length(trim(key)) > 0),
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    body_template TEXT NOT NULL CHECK (length(trim(body_template)) > 0),
    display_order INTEGER NOT NULL DEFAULT 0 CHECK (display_order >= 0),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (template_id, key)
  );

  CREATE TABLE outbound_signatures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    content TEXT NOT NULL CHECK (length(trim(content)) > 0),
    is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE UNIQUE INDEX outbound_signatures_one_default
    ON outbound_signatures(is_default) WHERE is_default = 1;

  CREATE TABLE outbound_packages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    material_type TEXT NOT NULL CHECK (material_type IN ('initial', 'update')),
    package_mode TEXT NOT NULL CHECK (package_mode IN ('change_only', 'current_complete')),
    selected_material_batch_id INTEGER REFERENCES material_batches(id) ON DELETE RESTRICT,
    package_name TEXT NOT NULL CHECK (length(trim(package_name)) > 0),
    zip_relative_path TEXT NOT NULL CHECK (
      length(trim(zip_relative_path)) > 0
      AND substr(zip_relative_path, 1, 1) NOT IN ('/', '\\')
      AND zip_relative_path NOT GLOB '[A-Za-z]:*'
      AND replace(zip_relative_path, '\\', '/') NOT IN ('.', '..')
      AND replace(zip_relative_path, '\\', '/') NOT LIKE '../%'
      AND replace(zip_relative_path, '\\', '/') NOT LIKE '%/../%'
      AND replace(zip_relative_path, '\\', '/') NOT LIKE '%/..'
      AND replace(zip_relative_path, '\\', '/') NOT LIKE './%'
      AND replace(zip_relative_path, '\\', '/') NOT LIKE '%/./%'
      AND replace(zip_relative_path, '\\', '/') NOT LIKE '%/.'
      AND replace(zip_relative_path, '\\', '/') NOT LIKE '%//%'
    ),
    status TEXT NOT NULL CHECK (status IN ('completed', 'cancelled', 'failed')),
    created_at TEXT NOT NULL
  );

  CREATE TABLE outbound_package_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    package_id INTEGER NOT NULL REFERENCES outbound_packages(id) ON DELETE CASCADE,
    project_item_id INTEGER NOT NULL REFERENCES dictionary_items(id) ON DELETE RESTRICT,
    drawing_id INTEGER REFERENCES drawing_numbers(id) ON DELETE RESTRICT,
    historical_drawing_id INTEGER REFERENCES historical_drawing_numbers(id) ON DELETE RESTRICT,
    pdf_file_id INTEGER NOT NULL REFERENCES pdf_files(id) ON DELETE RESTRICT,
    source_material_batch_id INTEGER NOT NULL REFERENCES material_batches(id) ON DELETE RESTRICT,
    project_item_name_snapshot TEXT NOT NULL CHECK (length(trim(project_item_name_snapshot)) > 0),
    drawing_code_snapshot TEXT NOT NULL CHECK (length(trim(drawing_code_snapshot)) > 0),
    file_name_snapshot TEXT NOT NULL CHECK (length(trim(file_name_snapshot)) > 0),
    relative_path_snapshot TEXT NOT NULL CHECK (length(trim(relative_path_snapshot)) > 0),
    source_batch_name_snapshot TEXT NOT NULL CHECK (length(trim(source_batch_name_snapshot)) > 0),
    CHECK ((drawing_id IS NOT NULL) <> (historical_drawing_id IS NOT NULL)),
    UNIQUE (package_id, pdf_file_id)
  );

  CREATE TABLE outbound_email_drafts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    package_id INTEGER NOT NULL REFERENCES outbound_packages(id) ON DELETE RESTRICT,
    template_id INTEGER REFERENCES outbound_email_templates(id) ON DELETE SET NULL,
    signature_id INTEGER REFERENCES outbound_signatures(id) ON DELETE SET NULL,
    recipients_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(recipients_json) AND json_type(recipients_json) = 'array'),
    cc_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(cc_json) AND json_type(cc_json) = 'array'),
    subject TEXT NOT NULL CHECK (length(trim(subject)) > 0),
    body TEXT NOT NULL CHECK (length(trim(body)) > 0),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX outbound_contacts_status_idx ON outbound_contacts(status);
  CREATE INDEX outbound_email_templates_material_type_idx ON outbound_email_templates(material_type, status);
  CREATE INDEX outbound_template_blocks_template_idx ON outbound_template_blocks(template_id, display_order);
  CREATE INDEX outbound_packages_product_created_idx ON outbound_packages(product_id, created_at DESC);
  CREATE INDEX outbound_packages_batch_idx ON outbound_packages(selected_material_batch_id);
  CREATE INDEX outbound_package_items_project_idx ON outbound_package_items(project_item_id);
  CREATE INDEX outbound_package_items_drawing_idx ON outbound_package_items(drawing_id);
  CREATE INDEX outbound_package_items_historical_drawing_idx ON outbound_package_items(historical_drawing_id);
  CREATE INDEX outbound_package_items_pdf_idx ON outbound_package_items(pdf_file_id);
  CREATE INDEX outbound_package_items_batch_idx ON outbound_package_items(source_material_batch_id);
  CREATE INDEX outbound_email_drafts_package_idx ON outbound_email_drafts(package_id, updated_at DESC);
  CREATE INDEX outbound_email_drafts_template_idx ON outbound_email_drafts(template_id);
  CREATE INDEX outbound_email_drafts_signature_idx ON outbound_email_drafts(signature_id);

  INSERT INTO outbound_email_templates (
    key, name, material_type, subject_template, body_template, status, created_at, updated_at
  ) VALUES
    ('initial_default', '首批包材资料', 'initial', '{{package_name}}',
      '{{company_name}}：\n\n{{contact_salutation}}，您好！\n\n附件为 {{model}}{{product_category}} 的包材资料，请注意查收。\n\n{{optional_blocks}}\n\n文件如有异常或任何不明之处，请及时与我联系，感谢！\n\n【收到请回复，感谢】\n\n{{signature}}',
      'active', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    ('update_default', '更新包材资料', 'update', '{{package_name}}',
      '{{company_name}}：\n\n{{contact_salutation}}，您好！\n\n附件为 {{model}}{{product_category}} 的更新包材资料。\n\n本次修改内容：\n{{change_description}}\n\n更新文件：\n{{file_list}}\n\n{{optional_blocks}}\n\n请更新资料并回传确认件。如有异常或任何不明之处，请及时与我联系，感谢！\n\n【收到请回复，感谢】\n\n{{signature}}',
      'active', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

  INSERT INTO outbound_signatures (name, content, is_default, status, created_at, updated_at)
  VALUES ('默认签名', '顺祝商祺\n田嘉滨     Yae\nTEL: 135 4423 5202\nEmail: tianjiabin@dd-industrial.net', 1, 'active',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
`;

export const schemaVersionTwelve = `
  CREATE TABLE outbound_packages_v12 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    material_type TEXT NOT NULL CHECK (material_type IN ('initial', 'update')),
    package_mode TEXT NOT NULL CHECK (package_mode IN ('change_only', 'current_complete')),
    selected_material_batch_id INTEGER REFERENCES material_batches(id) ON DELETE SET NULL,
    package_name TEXT NOT NULL CHECK (length(trim(package_name)) > 0),
    zip_relative_path TEXT NOT NULL CHECK (
      length(trim(zip_relative_path)) > 0
      AND substr(zip_relative_path, 1, 1) NOT IN ('/', '\\')
      AND zip_relative_path NOT GLOB '[A-Za-z]:*'
      AND replace(zip_relative_path, '\\', '/') NOT IN ('.', '..')
      AND replace(zip_relative_path, '\\', '/') NOT LIKE '../%'
      AND replace(zip_relative_path, '\\', '/') NOT LIKE '%/../%'
      AND replace(zip_relative_path, '\\', '/') NOT LIKE '%/..'
      AND replace(zip_relative_path, '\\', '/') NOT LIKE './%'
      AND replace(zip_relative_path, '\\', '/') NOT LIKE '%/./%'
      AND replace(zip_relative_path, '\\', '/') NOT LIKE '%/.'
      AND replace(zip_relative_path, '\\', '/') NOT LIKE '%//%'
    ),
    status TEXT NOT NULL CHECK (status IN ('completed', 'cancelled', 'failed')),
    created_at TEXT NOT NULL
  );

  CREATE TABLE outbound_package_items_v12 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    package_id INTEGER NOT NULL REFERENCES outbound_packages_v12(id) ON DELETE CASCADE,
    project_item_id INTEGER NOT NULL REFERENCES dictionary_items(id) ON DELETE RESTRICT,
    drawing_id INTEGER REFERENCES drawing_numbers(id) ON DELETE RESTRICT,
    historical_drawing_id INTEGER REFERENCES historical_drawing_numbers(id) ON DELETE RESTRICT,
    pdf_file_id INTEGER REFERENCES pdf_files(id) ON DELETE SET NULL,
    source_material_batch_id INTEGER REFERENCES material_batches(id) ON DELETE SET NULL,
    project_item_name_snapshot TEXT NOT NULL CHECK (length(trim(project_item_name_snapshot)) > 0),
    drawing_code_snapshot TEXT NOT NULL CHECK (length(trim(drawing_code_snapshot)) > 0),
    file_name_snapshot TEXT NOT NULL CHECK (length(trim(file_name_snapshot)) > 0),
    relative_path_snapshot TEXT NOT NULL CHECK (length(trim(relative_path_snapshot)) > 0),
    source_batch_name_snapshot TEXT NOT NULL CHECK (length(trim(source_batch_name_snapshot)) > 0),
    CHECK ((drawing_id IS NOT NULL) <> (historical_drawing_id IS NOT NULL)),
    UNIQUE (package_id, pdf_file_id)
  );

  CREATE TABLE outbound_email_drafts_v12 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    package_id INTEGER NOT NULL REFERENCES outbound_packages_v12(id) ON DELETE RESTRICT,
    template_id INTEGER REFERENCES outbound_email_templates(id) ON DELETE SET NULL,
    signature_id INTEGER REFERENCES outbound_signatures(id) ON DELETE SET NULL,
    recipients_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(recipients_json) AND json_type(recipients_json) = 'array'),
    cc_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(cc_json) AND json_type(cc_json) = 'array'),
    subject TEXT NOT NULL CHECK (length(trim(subject)) > 0),
    body TEXT NOT NULL CHECK (length(trim(body)) > 0),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  INSERT INTO outbound_packages_v12
    SELECT * FROM outbound_packages;

  INSERT INTO outbound_package_items_v12 (
    id, package_id, project_item_id, drawing_id, historical_drawing_id, pdf_file_id,
    source_material_batch_id, project_item_name_snapshot, drawing_code_snapshot,
    file_name_snapshot, relative_path_snapshot, source_batch_name_snapshot
  ) SELECT
    id, package_id, project_item_id, drawing_id, historical_drawing_id, pdf_file_id,
    source_material_batch_id, project_item_name_snapshot, drawing_code_snapshot,
    file_name_snapshot, relative_path_snapshot, source_batch_name_snapshot
  FROM outbound_package_items;

  INSERT INTO outbound_email_drafts_v12
    SELECT * FROM outbound_email_drafts;

  DROP TABLE outbound_email_drafts;
  DROP TABLE outbound_package_items;
  DROP TABLE outbound_packages;
  ALTER TABLE outbound_packages_v12 RENAME TO outbound_packages;
  ALTER TABLE outbound_package_items_v12 RENAME TO outbound_package_items;
  ALTER TABLE outbound_email_drafts_v12 RENAME TO outbound_email_drafts;

`;

export const schemaVersionThirteen = `
  ALTER TABLE drawing_numbers ADD COLUMN deleted_at TEXT;
  ALTER TABLE drawing_numbers ADD COLUMN deletion_mode TEXT
    CHECK (deletion_mode IN ('retain_occupied', 'release'));
  ALTER TABLE drawing_numbers ADD COLUMN deleted_full_code TEXT;
  ALTER TABLE drawing_numbers ADD COLUMN deleted_previous_status TEXT;
  ALTER TABLE drawing_numbers ADD COLUMN deleted_reason TEXT;
  ALTER TABLE drawing_numbers ADD COLUMN scan_resolution TEXT
    CHECK (scan_resolution IN ('pending', 'ignore'));

  ALTER TABLE historical_drawing_numbers ADD COLUMN deleted_at TEXT;
  ALTER TABLE historical_drawing_numbers ADD COLUMN deletion_mode TEXT
    CHECK (deletion_mode IN ('retain_occupied', 'release'));
  ALTER TABLE historical_drawing_numbers ADD COLUMN deleted_full_code TEXT;
  ALTER TABLE historical_drawing_numbers ADD COLUMN deleted_previous_status TEXT;
  ALTER TABLE historical_drawing_numbers ADD COLUMN deleted_reason TEXT;
  ALTER TABLE historical_drawing_numbers ADD COLUMN scan_resolution TEXT
    CHECK (scan_resolution IN ('pending', 'ignore'));

  CREATE TABLE drawing_deletion_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    origin TEXT NOT NULL CHECK (origin IN ('planned', 'historical')),
    record_id INTEGER NOT NULL,
    full_code TEXT NOT NULL,
    deletion_mode TEXT NOT NULL CHECK (deletion_mode IN ('retain_occupied', 'release')),
    previous_status TEXT NOT NULL,
    reason TEXT,
    reference_summary_json TEXT NOT NULL CHECK (json_valid(reference_summary_json)),
    deleted_at TEXT NOT NULL,
    restored_at TEXT
  );

  CREATE INDEX drawing_deletion_events_record_idx
    ON drawing_deletion_events(origin, record_id, deleted_at DESC);
  CREATE INDEX drawing_deletion_events_code_idx
    ON drawing_deletion_events(full_code, deleted_at DESC);
`;

export const schemaVersionFourteen = `
  ALTER TABLE bom_item_assets ADD COLUMN deleted_at TEXT;
  ALTER TABLE bom_item_assets ADD COLUMN inheritance_snapshot_json TEXT CHECK (inheritance_snapshot_json IS NULL OR json_valid(inheritance_snapshot_json));
  ALTER TABLE products ADD COLUMN deleted_at TEXT;
  ALTER TABLE products ADD COLUMN deletion_reason TEXT;
  ALTER TABLE product_qr_codes ADD COLUMN deleted_at TEXT;
  ALTER TABLE bom_versions ADD COLUMN updated_at TEXT;
  ALTER TABLE bom_versions ADD COLUMN edit_revision INTEGER NOT NULL DEFAULT 0 CHECK (edit_revision >= 0);
  UPDATE bom_versions SET updated_at = created_at;
  ALTER TABLE bom_items ADD COLUMN change_details TEXT;
  ALTER TABLE bom_items ADD COLUMN deleted_at TEXT;

  CREATE TABLE product_cleanup_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id),
    identity_json TEXT NOT NULL CHECK (json_valid(identity_json)),
    summary_json TEXT NOT NULL CHECK (json_valid(summary_json)),
    created_at TEXT NOT NULL
  );
  CREATE TABLE bom_asset_archive_mappings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_asset_id INTEGER NOT NULL REFERENCES bom_assets(id),
    archived_asset_id INTEGER NOT NULL REFERENCES bom_assets(id),
    bom_item_asset_id INTEGER NOT NULL REFERENCES bom_item_assets(id),
    created_at TEXT NOT NULL,
    UNIQUE(source_asset_id, bom_item_asset_id, archived_asset_id)
  );
  ALTER TABLE outbound_packages ADD COLUMN product_identity_json TEXT CHECK (product_identity_json IS NULL OR json_valid(product_identity_json));
  UPDATE outbound_packages SET product_identity_json = (
    SELECT json_object('sku', product.sku, 'model', product.model,
      'brandName', brand.name, 'productCategory', product.product_category)
    FROM products product JOIN dictionary_items brand ON brand.id = product.brand_id
    WHERE product.id = outbound_packages.product_id
  );
  CREATE TABLE outbound_package_parts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    package_id INTEGER NOT NULL REFERENCES outbound_packages(id) ON DELETE CASCADE,
    part_number INTEGER NOT NULL CHECK (part_number > 0),
    zip_relative_path TEXT NOT NULL,
    size_bytes INTEGER CHECK (size_bytes IS NULL OR size_bytes >= 0),
    UNIQUE(package_id, part_number)
  );
  INSERT INTO outbound_package_parts(package_id, part_number, zip_relative_path)
    SELECT id, 1, zip_relative_path FROM outbound_packages;
  ALTER TABLE outbound_package_items ADD COLUMN part_number INTEGER NOT NULL DEFAULT 1 CHECK (part_number > 0);
  ALTER TABLE outbound_package_items ADD COLUMN change_details_snapshot TEXT;
`;

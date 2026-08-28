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

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
    previous_drawing_id INTEGER REFERENCES drawing_numbers(id),
    change_reason TEXT,
    source_product_id INTEGER REFERENCES products(id),
    source_drawing_id INTEGER REFERENCES drawing_numbers(id),
    notes TEXT,
    created_at TEXT NOT NULL
  );

  INSERT INTO schema_migrations (version, applied_at)
  VALUES (1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
`;

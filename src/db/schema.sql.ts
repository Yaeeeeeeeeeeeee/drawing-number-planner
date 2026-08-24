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

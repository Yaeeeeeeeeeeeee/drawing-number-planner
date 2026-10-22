import { canonicalProductSql } from '../drawings/drawing-product-evidence.js';

// A PDF's directory usage is independent of the global drawing's confirmed owner.
// Resolve only a unique exact SKU-model directory against existing product IDs;
// this read-only projection never confirms or rewrites a historical drawing.
const normalizedPdfPath = "replace(file.relative_path, '/', char(92))";
const afterCategory = `substr(${normalizedPdfPath}, instr(${normalizedPdfPath}, char(92)) + 1)`;
const productDirectorySegment = `substr(${afterCategory}, 1, instr(${afterCategory}, char(92)) - 1)`;
export const pdfDirectoryProductSql = `(select min(${canonicalProductSql('directory_product.id')}) from products directory_product
  where directory_product.deleted_at is null and instr(${normalizedPdfPath}, char(92)) > 0
    and instr(${afterCategory}, char(92)) > 0 and directory_product.sku is not null
    and ${productDirectorySegment} = directory_product.sku || '-' || directory_product.model collate nocase
  having count(distinct ${canonicalProductSql('directory_product.id')}) = 1)`;


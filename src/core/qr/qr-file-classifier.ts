export interface QrClassifierProduct {
  id: number;
  sku: string | null;
  model: string;
  productCategory: string;
  status?: 'active' | 'inactive';
}

export interface QrClassifierPurpose {
  id: number;
  englishName: string;
  status?: 'active' | 'inactive';
}

export interface QrFileClassification {
  matchStatus: 'matched' | 'pending' | 'unmatched';
  productId: number | null;
  purposeId: number | null;
  model: string | null;
  detectedIdentifier: string | null;
  classificationWarning: string | null;
}

const QR_NAME = /^(?<name>.+)（(?<identifier>[^（）]*)）\.[^.]+$/u;

const normalizePurpose = (value: string) => value.trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-US');
const normalizeCategory = (value: string) => normalizePurpose(value).replace(/^\d+[.．、\s-]*/u, '');

export function matchesQrFilePurpose(fileName: string, model: string, englishName: string): boolean {
  const parsed = QR_NAME.exec(fileName);
  if (!parsed?.groups || !parsed.groups.identifier.trim()) return false;
  return normalizePurpose(parsed.groups.name) === normalizePurpose(`${model}-${englishName}`);
}

export function classifyQrFile(input: {
  relativePath: string;
  fileName: string;
  products: QrClassifierProduct[];
  purposes: QrClassifierPurpose[];
}): QrFileClassification {
  const parsed = QR_NAME.exec(input.fileName);
  if (!parsed?.groups) {
    return { matchStatus: 'unmatched', productId: null, purposeId: null, model: null,
      detectedIdentifier: null,
      classificationWarning: 'qr-filename-unrecognized' };
  }
  const detectedIdentifier = parsed.groups.identifier.trim() || null;
  if (detectedIdentifier == null) {
    return { matchStatus: 'pending', productId: null, purposeId: null, model: null, detectedIdentifier,
      classificationWarning: 'qr-identifier-empty' };
  }
  const directory = input.relativePath.split(/[\\/]+/).filter(Boolean);
  if (directory.length !== 3) {
    return { matchStatus: 'pending', productId: null, purposeId: null, model: null,
      detectedIdentifier,
      classificationWarning: 'qr-nested-directory' };
  }
  const [productCategory, productDirectory] = directory;
  const activeProducts = input.products.filter((product) => product.status !== 'inactive'
    && normalizeCategory(product.productCategory) === normalizeCategory(productCategory) && product.sku != null
    && normalizePurpose(`${product.sku}-${product.model}`) === normalizePurpose(productDirectory));
  const activePurposes = input.purposes.filter((purpose) => purpose.status !== 'inactive');
  if (activeProducts.length !== 1) {
    return { matchStatus: 'pending', productId: null, purposeId: null, model: null, detectedIdentifier,
      classificationWarning: activeProducts.length > 1 ? 'qr-product-ambiguous' : 'qr-product-unresolved' };
  }
  const product = activeProducts[0];
  const purposes = activePurposes.filter((purpose) => matchesQrFilePurpose(input.fileName, product.model, purpose.englishName));
  if (purposes.length === 1) {
    return { matchStatus: 'matched', productId: product.id, purposeId: purposes[0].id, model: product.model,
      detectedIdentifier, classificationWarning: null };
  }
  return { matchStatus: 'pending', productId: null, purposeId: null, model: null,
    detectedIdentifier, classificationWarning: purposes.length > 1 ? 'qr-purpose-ambiguous' : 'qr-purpose-unrecognized' };
}

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
  classificationWarning: string | null;
}

const QR_NAME = /^(?<name>.+)（(?:二维码的)?网址编码）\.[^.]+$/u;

function purposeMatches(fileName: string, product: QrClassifierProduct, purpose: QrClassifierPurpose): boolean {
  const prefix = `${product.model}-`;
  if (!fileName.startsWith(prefix)) return false;
  const value = fileName.slice(prefix.length);
  return purpose.englishName.toLocaleLowerCase('en-US') === 'warranty'
    ? value.localeCompare(purpose.englishName, 'en-US', { sensitivity: 'accent' }) === 0
    : value === purpose.englishName;
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
      classificationWarning: 'qr-filename-unrecognized' };
  }
  const directory = input.relativePath.split(/[\\/]+/).filter(Boolean);
  if (directory.length !== 3) {
    return { matchStatus: 'pending', productId: null, purposeId: null, model: null,
      classificationWarning: 'qr-nested-directory' };
  }
  const [productCategory, productDirectory] = directory;
  const activeProducts = input.products.filter((product) => product.status !== 'inactive'
    && product.productCategory === productCategory && product.sku != null
    && `${product.sku}-${product.model}` === productDirectory);
  const activePurposes = input.purposes.filter((purpose) => purpose.status !== 'inactive');
  const matches = activeProducts.flatMap((product) => activePurposes
    .filter((purpose) => purposeMatches(parsed.groups!.name, product, purpose))
    .map((purpose) => ({ product, purpose })));
  if (matches.length === 1) {
    const { product, purpose } = matches[0];
    return { matchStatus: 'matched', productId: product.id, purposeId: purpose.id, model: product.model, classificationWarning: null };
  }
  const hasPurposeName = activePurposes.some((purpose) => activeProducts.some((product) => purposeMatches(parsed.groups!.name, product, purpose)));
  return { matchStatus: 'pending', productId: null, purposeId: null, model: null,
    classificationWarning: hasPurposeName ? 'qr-product-unresolved' : 'qr-purpose-unrecognized' };
}

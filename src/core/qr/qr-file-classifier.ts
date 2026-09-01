export interface QrClassifierProduct {
  id: number;
  sku: string | null;
  model: string;
  productCategory: string;
}

export interface QrClassifierPurpose {
  id: number;
  englishName: string;
}

export interface QrFileClassification {
  matchStatus: 'matched' | 'pending' | 'unmatched';
  productId: number | null;
  purposeId: number | null;
  model: string | null;
  classificationWarning: string | null;
}

const QR_NAME = /^(?<model>.+?)-(?<purpose>.+?)（(?:二维码的)?网址编码）\.[^.]+$/u;

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
  const model = parsed.groups.model.trim();
  const purposeName = parsed.groups.purpose.trim();
  const directory = input.relativePath.split(/[\\/]+/).filter(Boolean);
  const productCategory = directory.length >= 1 ? directory[0] : null;
  const productDirectory = directory.length >= 2 ? directory[1] : null;
  const separator = productDirectory?.indexOf('-') ?? -1;
  const sku = separator > 0 ? productDirectory!.slice(0, separator) : null;
  const directoryModel = separator > 0 ? productDirectory!.slice(separator + 1) : null;
  const purposes = input.purposes.filter((purpose) => purpose.englishName.localeCompare(purposeName, 'en-US', { sensitivity: 'accent' }) === 0);
  const products = input.products.filter((product) => product.model === model
    && product.model === directoryModel && product.productCategory === productCategory
    && product.sku?.toLocaleLowerCase('en-US') === sku?.toLocaleLowerCase('en-US'));
  if (purposes.length === 1 && products.length === 1) {
    return { matchStatus: 'matched', productId: products[0].id, purposeId: purposes[0].id, model, classificationWarning: null };
  }
  return { matchStatus: 'pending', productId: null, purposeId: null, model,
    classificationWarning: purposes.length !== 1 ? 'qr-purpose-unrecognized' : 'qr-product-unresolved' };
}

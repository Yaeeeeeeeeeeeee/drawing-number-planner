import { inspectDrawingCodesInFilename, type ParsedDrawingCode } from '../drawings/drawing-code.js';
import { parseProductDirectory, type DirectoryProductContext } from './directory-policy.js';
import type { ConversionType, DrawingCodeReference, FileMatchStatus } from './file-types.js';

export interface HistoricalPdfInput {
  relativePath: string;
  fileName: string;
  drawings: DrawingCodeReference[];
}

export interface HistoricalPdfClassification {
  matchStatus: FileMatchStatus;
  drawingId: number | null;
  historicalCode: ParsedDrawingCode | null;
  detectedCodes: string[];
  conversionType: ConversionType;
  classificationWarning: string | null;
  directoryContext: DirectoryProductContext | null;
}

function conversionFromPath(relativePath: string, fileName: string): {
  conversionType: ConversionType;
  warning: string | null;
} {
  const segments = relativePath.split(/[\\/]+/);
  const inSourceDirectory = segments.includes('02.未转曲源文件');
  const inOutlinedDirectory = segments.some((segment) => segment.startsWith('03.量产后的变更文件'));
  const outlinedSuffix = fileName.includes('（转曲）');
  if (inSourceDirectory) {
    return { conversionType: 'source', warning: outlinedSuffix ? 'conversion-conflict: 源文件目录中的文件名包含（转曲）' : null };
  }
  if (inOutlinedDirectory) return { conversionType: 'outlined', warning: null };
  return { conversionType: outlinedSuffix ? 'outlined' : 'source', warning: null };
}

export function classifyHistoricalPdf(input: HistoricalPdfInput): HistoricalPdfClassification {
  const inspection = inspectDrawingCodesInFilename(input.fileName);
  const conversion = conversionFromPath(input.relativePath, input.fileName);
  const directoryContext = parseProductDirectory(input.relativePath);
  if (inspection.status === 'unmatched') {
    return { matchStatus: 'unmatched', drawingId: null, historicalCode: null, detectedCodes: [],
      conversionType: conversion.conversionType, classificationWarning: conversion.warning, directoryContext };
  }
  if (inspection.status === 'pending') {
    return { matchStatus: 'pending', drawingId: null, historicalCode: null, detectedCodes: inspection.candidates,
      conversionType: conversion.conversionType,
      classificationWarning: [inspection.reason, conversion.warning].filter(Boolean).join('; '), directoryContext };
  }
  const formalMatches = input.drawings.filter((drawing) => drawing.fullCode === inspection.code.fullCode);
  if (formalMatches.length > 1) {
    return { matchStatus: 'conflict', drawingId: null, historicalCode: null, detectedCodes: inspection.candidates,
      conversionType: conversion.conversionType, classificationWarning: 'formal-code-conflict', directoryContext };
  }
  return { matchStatus: 'matched', drawingId: formalMatches[0]?.id ?? null,
    historicalCode: formalMatches.length === 0 ? inspection.code : null,
    detectedCodes: inspection.candidates, conversionType: conversion.conversionType,
    classificationWarning: conversion.warning, directoryContext };
}

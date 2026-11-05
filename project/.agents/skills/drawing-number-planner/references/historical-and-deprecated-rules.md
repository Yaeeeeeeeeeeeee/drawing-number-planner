# Historical and deprecated material

## Historical only

These items may explain why code or migrations contain compatibility logic, but they must not silently drive new work:

- Early designs that treated BOM V1/V2/V3/V4 as a user-facing business model.
- Early designs that merged SKU and model or called SKU an internal model code.
- Early designs that treated appearance as display-only or relied on Excel as the complete used-number source.
- Early PDF rules that required perfect directory structure or ignored directory semantics.
- Early single-ZIP outbound behavior.
- Early BOM designs that merged material, dimensions, position, image, diagram, or change details.
- Old acceptance snapshots and their data/test counts.

## Deprecated

Do not restore without a new explicit request:

- User-facing BOM V-number concepts.
- Deleting a drawing as an implicit number release.
- Silent fallback from a missing current file to an older file.
- Treating a file timestamp as the authoritative current batch.
- Cross-product reuse based only on matching filenames or drawing numbers.
- Automatic QR activation from an unknown or ambiguous scan.
- Moving or deleting original PDFs to clean an index.
- Exposing local paths, batch sources, IDs, or storage details in supplier email text.
- Splitting a PDF file to satisfy an outbound package limit.
- Requiring users to clean product data one module at a time.

When an old document conflicts with a Current rule, the Current rule wins only after confirming it against the actual implementation and latest approved project records. Otherwise classify the matter as Pending Confirmation.

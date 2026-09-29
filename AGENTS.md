# Project Architecture Rules

- All invoice-scanner product links must use `buildMatchLinkPatch`; this keeps supplier-specific Items Master display/save fields atomic while preserving scanned matching evidence.
- Scanner price updates must write the linked supplier entry first and synchronize canonical item cost fields from that supplier conversion; prices are supplier-specific.
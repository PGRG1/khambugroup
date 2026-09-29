# Project Architecture Rules

- All invoice-scanner product links must use `buildMatchLinkPatch`; this keeps supplier-specific Items Master display/save fields atomic while preserving scanned matching evidence.
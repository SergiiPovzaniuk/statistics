// =============================================================================
// SME ScriptCode — team helper library (Rhino / Eximee)
// =============================================================================
// NOT a platform API. Eximee has no import/require — copy functions into
// callService() before the closing brace (or sync via CI).
//
// Platform APIs used inside helpers:
//   context.getFirstParameter(name)  — single input value
//   context.getParameters(name)      — list from repeatable section / multi input
//   context.getInputParameters()       — full input map (thin scripts)
//
// Guide: EXIMEE_SCRIPT_SHORT_GUIDE.md
// Used in: sme_zapisz_dane_beneficjentow.js
// =============================================================================

// Replaces: flag === true || flag === "true"
// Example:
//   if (isTrue(p.clientForeignRevenueFlag)) { ... }
function isTrue(v) {
    return v === true || v === 'true';
}

// Normalizes empty form sentinels to null.
// Example:
//   checkFieldValue("")      → null
//   checkFieldValue("null")  → null
//   checkFieldValue("PL")    → "PL"
function checkFieldValue(value) {
    if (value == null || value === '' || value === 'null' || value === undefined) return null;
    return value;
}

// Wraps context.getFirstParameter — use for single-value script inputs.
// Example:
//   const processId = getScalar(context, 'processId');
//   // same as: checkFieldValue(context.getFirstParameter('processId'))
function getScalar(ctx, name) {
    return checkFieldValue(ctx.getFirstParameter(name));
}

// Parses list string from getParameters into JS array (trimmed).
// Example:
//   createTargetFormat("[PL, DE ,FR]")  → ["PL", "DE", "FR"]
//   createTargetFormat(null)            → []
function createTargetFormat(value) {
    if (value == null || value === 'null') return [];
    const parts = value.toString().replace(/^\[|\]$/g, '').split(',');
    for (let i = 0; i < parts.length; i++) parts[i] = parts[i].trim();
    return parts;
}

// For names/addresses where values are joined with ", " (comma + space).
// Example:
//   createTargetFormatPreservingSpaces("[Jan Kowalski, Anna Nowak]")
//     → ["Jan Kowalski", "Anna Nowak"]
function createTargetFormatPreservingSpaces(value) {
    if (value == null || value === 'null') return [];
    return value.toString().replace(/^\[|\]$/g, '').split(', ');
}

// For note fields — no trim, split on comma only.
// Example:
//   createTargetFormatForOtherValue("[note one,note two]") → ["note one", "note two"]
function createTargetFormatForOtherValue(value) {
    if (value == null || value === 'null') return [];
    return value.toString().replace(/[\[\]]/g, '').split(',');
}

// Merges pairs of digits into decimals per row (foreign revenue percentages).
// Example:
//   createTargetFormatDouble("[12, 5, 3, 0]", 2)  → [12.05, 3.0]
//   // 12 + 05 → 12.05, 3 + 0 → 3.0
function createTargetFormatDouble(value, sectionsNumber) {
    const digits = createTargetFormat(value);
    const result = [];
    for (let i = 0; i < sectionsNumber; i++) {
        const idx = i * 2;
        const integerPart = String(digits[idx] || 0);
        const decimalRaw = String(digits[idx + 1] || 0);
        const decimalPart = decimalRaw.length === 1 ? '0' + decimalRaw : decimalRaw;
        result.push(parseFloat(integerPart + '.' + decimalPart));
    }
    return result;
}

// Wraps context.getParameters — use for repeatable-section / multi-value inputs.
// mode: 'trim' | 'preserveSpaces' | 'other'
// Example:
//   const pesels = getArray(context, 'peselNumbers', 'trim');
//   const names  = getArray(context, 'firstNames', 'preserveSpaces');
//   const notes  = getArray(context, 'incomeCodesINNote', 'other');
function getArray(ctx, name, mode) {
    const raw = ctx.getParameters(name);
    if (mode === 'preserveSpaces') return createTargetFormatPreservingSpaces(raw);
    if (mode === 'other') return createTargetFormatForOtherValue(raw);
    return createTargetFormat(raw);
}

// Batch-read scalar inputs into one object.
// Example:
//   const p = readScalars(context, ['processId', 'gotCrbrPrintoutFlag']);
//   // p.processId, p.gotCrbrPrintoutFlag
function readScalars(ctx, names) {
    const out = {};
    for (let i = 0; i < names.length; i++) {
        out[names[i]] = getScalar(ctx, names[i]);
    }
    return out;
}

// Creates { fieldName: [] } for conditional blocks.
// Example:
//   const empty = emptyFieldMap(['countryCodes', 'countryNames']);
//   // { countryCodes: [], countryNames: [] }
function emptyFieldMap(names) {
    const out = {};
    for (let i = 0; i < names.length; i++) {
        out[names[i]] = [];
    }
    return out;
}

// Reads array fields only when a boolean flag is true.
// Example:
//   const shares = readIfFlag(context, 'clientHoldSharesOver50AbroadFlag', [
//       'clientHoldSharesOver50AbroadCountriesCountryCodes',
//       'clientHoldSharesOver50AbroadCountriesCountryNames'
//   ]);
//   // if flag false → both arrays stay []
//   // if flag true  → shares.clientHoldSharesOver50AbroadCountriesCountryCodes = [...]
//
// Optional per-field mode override:
//   readIfFlag(ctx, 'flag', ['activityType'], { activityType: 'other' })
function readIfFlag(ctx, flagName, fields, modes) {
    const out = emptyFieldMap(fields);
    if (!isTrue(getScalar(ctx, flagName))) return out;
    for (let i = 0; i < fields.length; i++) {
        const mode = (modes && modes[fields[i]]) || 'trim';
        out[fields[i]] = getArray(ctx, fields[i], mode);
    }
    return out;
}

// One-shot read: scalars + three array groups.
// Example:
//   const p = readParams(
//       context,
//       ['processId', 'confirmBeneficiaryData'],
//       ['hashes', 'peselNumbers'],
//       ['firstNames', 'surnames'],
//       ['incomeCodesINNote']
//   );
function readParams(ctx, scalars, arrayTrim, arrayPreserve, arrayOther) {
    const p = readScalars(ctx, scalars);
    if (arrayTrim) {
        for (let i = 0; i < arrayTrim.length; i++) {
            p[arrayTrim[i]] = getArray(ctx, arrayTrim[i], 'trim');
        }
    }
    if (arrayPreserve) {
        for (let i = 0; i < arrayPreserve.length; i++) {
            p[arrayPreserve[i]] = getArray(ctx, arrayPreserve[i], 'preserveSpaces');
        }
    }
    if (arrayOther) {
        for (let i = 0; i < arrayOther.length; i++) {
            p[arrayOther[i]] = getArray(ctx, arrayOther[i], 'other');
        }
    }
    return p;
}

// Maps checkbox "true" → enum code, empty/false → null.
// Example:
//   enumFromBool("true", "ROL")   → "ROL"
//   enumFromBool("false", "ROL")  → null
//   enumFromBool("", "ROL")       → null
function enumFromBool(v, code) {
    if (v === '' || v === 'false') return null;
    return code;
}

// enumFromBool applied to each row in a repeatable section.
// Example:
//   enumArrayFromBool(["true", "false", "true"], "UO")  → ["UO", null, "UO"]
function enumArrayFromBool(arr, code) {
    const out = [];
    for (let i = 0; i < arr.length; i++) {
        out.push(enumFromBool(arr[i], code));
    }
    return out;
}

// Reads incomeCodesUO, incomeCodesUN, … from config — replaces 6 lines per code.
// prefix + code builds param name: 'incomeCodes' + 'UO' → 'incomeCodesUO'
// Example:
//   const INCOME_CODES = ['UO', 'UN', 'DZ'];
//   const incomeEnums = mapEnumGroups(context, INCOME_CODES, 'incomeCodes');
//   // incomeEnums.UO[i], incomeEnums.UN[i] per beneficiary row i
function mapEnumGroups(ctx, codes, prefix) {
    const out = {};
    for (let i = 0; i < codes.length; i++) {
        const code = codes[i];
        out[code] = enumArrayFromBool(getArray(ctx, prefix + code, 'trim'), code);
    }
    return out;
}

// Safe array index for row builders — missing index returns null.
// Example:
//   at(['a', 'b'], 0)  → 'a'
//   at(['a'], 5)       → null
//   at(null, 0)        → null
function at(arr, i) {
    return arr && arr[i] !== undefined ? arr[i] : null;
}

// Lookup label from ca-sme-GetDictionaryDataServiceProxy result (Java list).
// Example:
//   const dict = context.callService("ca-sme-GetDictionaryDataServiceProxy", {...});
//   getCountryValueByKey(dict, "PL")  → "Polska"
function getCountryValueByKey(countries, key) {
    if (key == null || key === undefined) return null;
    for (let i = 0; i < countries.size(); i++) {
        const country = countries.get(i);
        if (country.get('key') == key) return country.get('value');
    }
    return null;
}

// Thin script pattern — pass all form inputs to Java as JSON.
// Example:
//   const payload = serializeInputMap(context.getInputParameters());
//   context.callService(PROXY, { processId: [processId], formPayload: [payload] });
function serializeInputMap(input) {
    const out = {};
    const keys = input.keySet().iterator();
    while (keys.hasNext()) {
        const k = String(keys.next());
        out[k] = input.get(k).toArray();
    }
    return JSON.stringify(out);
}

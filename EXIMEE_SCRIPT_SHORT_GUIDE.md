# How to Write Short Eximee ScriptCode Scripts

Practical guide for developers. Complements [Eximee ScriptCode docs](documents.txt).

**Goal:** scripts that are easy to review, test, and change when forms grow.

| Target | Lines | Example |
|--------|------:|---------|
| Thin adapter (preferred for large forms) | ≤80 | `sme_crbr_zapisz_dane_formularza.js` |
| Normal scriptService | ≤200 | `sme_graphql_api.js` |
| Complex save (exception, needs ADR) | ≤400 | refactored `sme_zapisz_dane_beneficjentow.js` |
| Red flag | >500 | old monolithic save scripts |

---

## Platform API vs team helpers

Eximee provides `context` inside `callService`. Methods like `getScalar` are **not** platform APIs — they are **team helpers** you copy from [lib/sme-common.js](lib/sme-common.js) into each script (Rhino has no `import`/`require`).

| Source | Examples | Where defined |
|--------|----------|---------------|
| **Eximee platform** | `context.getFirstParameter`, `context.getParameters`, `context.callService`, `context.getInputParameters`, `Logger.info` | [scriptcode-api.mdc](.cursor/rules/scriptcode-api.mdc) |
| **Team helpers** | `getScalar`, `getArray`, `readIfFlag`, `mapEnumGroups`, `createTargetFormat` | [lib/sme-common.js](lib/sme-common.js) — paste into `callService` |
| **Script-specific** | `buildPersonalData`, `CrbrData`, `PersonalData` | Your script only |

### How helpers relate to platform API

```
Form Designer inputs
        ↓
context.getFirstParameter('processId')     ← platform (single value)
context.getParameters('peselNumbers')      ← platform (Java list → string like "[a,b,c]")
        ↓
getScalar(context, 'processId')            ← team helper (wraps getFirstParameter + checkFieldValue)
getArray(context, 'peselNumbers', 'trim')  ← team helper (wraps getParameters + createTargetFormat)
        ↓
p.peselNumbers[i]                          ← plain JS array in your logic
```

---

## Team helper library (full bodies)

Canonical source: **[lib/sme-common.js](lib/sme-common.js)**. Copy functions into `callService` before the closing `}`.

### `checkFieldValue` — normalize empty sentinels

Replaces scattered `== "" || == "null"` checks.

```js
function checkFieldValue(value) {
    if (value == null || value === '' || value === 'null' || value === undefined) return null;
    return value;
}
```

### `getScalar` — read one scriptService input

Wraps **`context.getFirstParameter`** (platform).

```js
function getScalar(ctx, name) {
    return checkFieldValue(ctx.getFirstParameter(name));
}
```

### `createTargetFormat` / `getArray` — list inputs from repeatable sections

Wraps **`context.getParameters`** (platform). Form sends lists as bracket strings, e.g. `[PL,DE,FR]`.

```js
function createTargetFormat(value) {
    if (value == null || value === 'null') return [];
    const parts = value.toString().replace(/^\[|\]$/g, '').split(',');
    for (let i = 0; i < parts.length; i++) parts[i] = parts[i].trim();
    return parts;
}

function createTargetFormatPreservingSpaces(value) {
    if (value == null || value === 'null') return [];
    return value.toString().replace(/^\[|\]$/g, '').split(', ');
}

function createTargetFormatForOtherValue(value) {
    if (value == null || value === 'null') return [];
    return value.toString().replace(/[\[\]]/g, '').split(',');
}

function getArray(ctx, name, mode) {
    const raw = ctx.getParameters(name);
    if (mode === 'preserveSpaces') return createTargetFormatPreservingSpaces(raw);
    if (mode === 'other') return createTargetFormatForOtherValue(raw);
    return createTargetFormat(raw);
}
```

| `mode` | When to use |
|--------|-------------|
| `'trim'` | Default — codes, flags, PESELs |
| `'preserveSpaces'` | Names, addresses (`firstNames`, `surnames`) |
| `'other'` | Notes fields that must not trim (`incomeCodesINNote`) |

### `readScalars` / `readParams` — batch-read config

```js
function readScalars(ctx, names) {
    const out = {};
    for (let i = 0; i < names.length; i++) {
        out[names[i]] = getScalar(ctx, names[i]);
    }
    return out;
}

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
```

### `isTrue` / `readIfFlag` — conditional array blocks

```js
function isTrue(v) {
    return v === true || v === 'true';
}

function emptyFieldMap(names) {
    const out = {};
    for (let i = 0; i < names.length; i++) out[names[i]] = [];
    return out;
}

function readIfFlag(ctx, flagName, fields, modes) {
    const out = emptyFieldMap(fields);
    if (!isTrue(getScalar(ctx, flagName))) return out;
    for (let i = 0; i < fields.length; i++) {
        const mode = (modes && modes[fields[i]]) || 'trim';
        out[fields[i]] = getArray(ctx, fields[i], mode);
    }
    return out;
}
```

### `enumFromBool` / `mapEnumGroups` — checkbox → enum code

```js
function enumFromBool(v, code) {
    if (v === '' || v === 'false') return null;
    return code;
}

function enumArrayFromBool(arr, code) {
    const out = [];
    for (let i = 0; i < arr.length; i++) out.push(enumFromBool(arr[i], code));
    return out;
}

function mapEnumGroups(ctx, codes, prefix) {
    const out = {};
    for (let i = 0; i < codes.length; i++) {
        const code = codes[i];
        out[code] = enumArrayFromBool(getArray(ctx, prefix + code, 'trim'), code);
    }
    return out;
}
```

Builds param names: `prefix + code` → e.g. `incomeCodes` + `UO` → `incomeCodesUO`.

### `at` — safe index for row builders

```js
function at(arr, i) {
    return arr && arr[i] !== undefined ? arr[i] : null;
}
```

### `getCountryValueByKey` — dictionary lookup after `context.callService`

Uses Java list from **`ca-sme-GetDictionaryDataServiceProxy`** (platform `callService`).

```js
function getCountryValueByKey(countries, key) {
    if (key == null || key === undefined) return null;
    for (let i = 0; i < countries.size(); i++) {
        const country = countries.get(i);
        if (country.get('key') == key) return country.get('value');
    }
    return null;
}
```

### `serializeInputMap` — thin script pattern

Wraps **`context.getInputParameters`** (platform) for backend mapping.

```js
function serializeInputMap(input) {
    const out = {};
    const keys = input.keySet().iterator();
    while (keys.hasNext()) {
        const k = String(keys.next());
        out[k] = input.get(k).toArray();
    }
    return JSON.stringify(out);
}
```

---

## Refactoring examples (before → after)

Real patterns from `sme_zapisz_dane_beneficjentow.js`: **1360 → 572 lines**.

### Example 1: Scalar + array extraction

**Before (~8 lines per 4 fields):**

```js
let hashes = context.getParameters('hashes');
let hashesArray = createTargetFormat(hashes);

let peselNumbers = context.getParameters('peselNumbers');
let peselNumbersArray = createTargetFormat(peselNumbers);

let firstNames = context.getParameters('firstNames');
let firstNamesArray = createTargetFormatPreservingSpaces(firstNames);

let surnames = context.getParameters('surnames');
let surnamesArray = createTargetFormatPreservingSpaces(surnames);
```

**After:**

```js
const SCALARS = ['processId', 'gotCrbrPrintoutFlag'];
const ARRAY_TRIM = ['hashes', 'peselNumbers'];
const ARRAY_PRESERVE = ['firstNames', 'surnames'];

const p = readParams(context, SCALARS, ARRAY_TRIM, ARRAY_PRESERVE, null);
// p.hashes[i], p.firstNames[i]
```

---

### Example 2: Conditional flag + country arrays

**Before (~25 lines):**

```js
let clientHoldSharesOver50AbroadFlag = context.getFirstParameter('clientHoldSharesOver50AbroadFlag');
let clientHoldSharesOver50AbroadCountriesCountryCodesArray = [];
let clientHoldSharesOver50AbroadCountriesCountryNamesArray = [];

if (clientHoldSharesOver50AbroadFlag === true || clientHoldSharesOver50AbroadFlag === "true") {
    let codes = context.getParameters('clientHoldSharesOver50AbroadCountriesCountryCodes');
    clientHoldSharesOver50AbroadCountriesCountryCodesArray = createTargetFormat(codes);
    let names = context.getParameters('clientHoldSharesOver50AbroadCountriesCountryNames');
    clientHoldSharesOver50AbroadCountriesCountryNamesArray = createTargetFormat(names);
}
```

**After (~6 lines):**

```js
const sharesOver50 = readIfFlag(context, 'clientHoldSharesOver50AbroadFlag', [
    'clientHoldSharesOver50AbroadCountriesCountryCodes',
    'clientHoldSharesOver50AbroadCountriesCountryNames'
]);
// sharesOver50.clientHoldSharesOver50AbroadCountriesCountryCodes
```

---

### Example 3: Income code enums (19 codes × 2 sections)

**Before (~6 lines × 38 ≈ 228 lines):**

```js
let incomeCodesUO = context.getParameters('incomeCodesUO');
let incomeCodesUOArray = createTargetFormat(incomeCodesUO);
let incomeCodesUOEnumArray = returnEnumValuesCodeBasedOnBoolean(incomeCodesUOArray, "UO");
// ... repeated for UN, DZ, DR, DK, RK, RT, EM, UK, UZ, UD, UA, IN, PR, WL, DC, ZZ, BD, RR, ST
// ... again for typeOfIncomeCodes*
```

**After (~4 lines):**

```js
const INCOME_CODES = ['UO', 'UN', 'DZ', 'DR', 'DK', 'RK', 'RT', 'EM', 'UK', 'UZ', 'UD', 'UA', 'IN', 'PR', 'WL', 'DC', 'ZZ', 'BD', 'RR', 'ST'];
const incomeEnums = mapEnumGroups(context, INCOME_CODES, 'incomeCodes');
const typeOfIncomeEnums = mapEnumGroups(context, INCOME_CODES, 'typeOfIncomeCodes');
// row i: incomeEnums.UO[i], incomeEnums.UN[i]
```

---

### Example 4: AML single-checkbox enums

**Before (~2 lines × 17 checkboxes):**

```js
let agroProduction = context.getFirstParameter('agroProduction');
let agroProducitonEnum = returnEnumValueCodeBasedOnBoolean(agroProduction, "ROL");
let foodProduction = context.getFirstParameter('foodProduction');
let foodProductionEnum = returnEnumValueCodeBasedOnBoolean(foodProduction, "PSP");
```

**After:**

```js
const BUSINESS_PROFILE = [
    ['agroProduction', 'ROL'],
    ['foodProduction', 'PSP'],
    ['industrialProduction', 'PPR']
];
const businessProfileCodes = BUSINESS_PROFILE
    .map(function(pair) { return enumFromBool(getScalar(context, pair[0]), pair[1]); })
    .filter(function(x) { return x; });
```

---

### Example 5: Beneficiary row loop

**Before (~117 lines in loop body):**

```js
let index = 0;
while (index < 10) {
    let beneficiariesData = new PersonalData(
        beneficiaryNamesArray[index],
        addNewBeneficiaryFlagsArray[index],
        differencesBeneficiaryAndCrbrFlagsArray[index],
        // ... 70+ more positional arguments ...
        sharesAmountsArray[index]
    );
    if (beneficiariesData.surname) finalBeneficiariesDataArray.push(beneficiariesData);
    index++;
}
```

**After:**

```js
const rowCount = Math.max(p.surnames.length, 10);
for (let i = 0; i < rowCount; i++) {
    const row = buildPersonalData(i, p, incomeEnums, typeOfIncomeEnums, highRiskEnums, dictionaryCountries);
    if (row.surname) finalBeneficiariesDataArray.push(row);
}

function buildPersonalData(i, data, income, typeIncome, highRisk, dict) {
    return new PersonalData(
        at(data.beneficiaryNames, i),
        at(data.surnames, i),
        pickEnum(income, 'UO', i),
        // ... uses at() and pickEnum() instead of 80 raw array[index] args
    );
}

function pickEnum(enums, code, i) {
    return at(enums[code], i);
}
```

---

### Example 6: CRS Benef1…Benef10 (form not yet repeatable)

**Before:** ~70 `getParameters` pairs + 10 copy-pasted `if (peselBenefN)` blocks.

**After (interim — loop over suffix until form uses repeatable section):**

```js
const BENEF_FIELDS = ['countryCode', 'countryName', 'tin', 'noTin', 'countryDontHaveTin', 'reason', 'specialStatementForLackTinInUSA'];
const benefData = [];
for (let n = 1; n <= 10; n++) {
    const pesel = getScalar(context, 'peselBenef' + n);
    if (!pesel) continue;
    const arrays = {};
    for (let f = 0; f < BENEF_FIELDS.length; f++) {
        arrays[BENEF_FIELDS[f]] = getArray(context, BENEF_FIELDS[f] + 'Benef' + n, 'trim');
    }
    benefData.push({ peselNumber: pesel, crsTaxResidenceList: buildTaxResidenceList(arrays) });
}
```

**Target (after form change):**

```js
const rows = context.getParameters('crsBeneficiaryRows').toArray();
const benefData = rows.map(function(row) {
    return { peselNumber: row.pesel, crsTaxResidenceList: buildTaxResidenceList(row.taxResidences) };
}).filter(function(b) { return b.peselNumber; });
```

---

### Example 7: Thin script (move mapping to Java)

**Before:** 1360-line script building full JSON DTO.

**After (~25 lines):**

```js
function callService(context) {
    const processId = context.getFirstParameter('processId');
    if (!processId) throw new Error('Missing processId');

    const payload = serializeInputMap(context.getInputParameters());

    try {
        context.callService('ca-sme-SaveBeneficiaryDataServiceProxy', {
            processId: [processId],
            formPayload: [payload]
        });
    } catch (e) {
        Logger.error('SaveBeneficiaryData failed: {}', e);
        throw e;
    }
    return [{ output: payload }];
}
```

Reference: [sme_crbr_zapisz_dane_formularza.js](sme_crbr_zapisz_dane_formularza.js).

---

## Standard script layout

```js
function callService(context) {
    const PROXY = 'ca-sme-SaveXServiceProxy';
    const SCALARS = ['processId', 'flagA'];
    const ARRAY_TRIM = ['names', 'codes'];
    const ARRAY_PRESERVE = ['firstNames'];

    const p = readParams(context, SCALARS, ARRAY_TRIM, ARRAY_PRESERVE, null);
    const dto = buildDto(p);

    context.callService(PROXY, { processId: [p.processId], json: [JSON.stringify(dto)] });
    return [{ output: JSON.stringify(dto) }];

    // paste helpers from lib/sme-common.js here
    // add script-specific buildDto, DTO constructors
}
```

Rhino: no `import`/`require`, no `eval`. Sync [lib/sme-common.js](lib/sme-common.js) via paste or CI.

---

## Form design (biggest lever)

### Do

- Repeatable sections → `context.getParameters('beneficiaryRows').toArray()`
- One array param per list

### Don't

- `peselBenef1` … `peselBenef10`, `tin1` … `tin10`
- `for (n = 1; n <= 10)` over suffixes — fix the form instead

---

## Split before you swell

| Monolith | Split into |
|----------|------------|
| Save CRBR + beneficiaries | `save_crbr_flags` + `save_beneficiaries` |
| Persons + agreements | `save_persons` + `save_agreements` |

---

## Hygiene checklist

- [ ] `Logger.info` / `Logger.error` — not `context.log()`
- [ ] `const` / `let` — `let` inside `for` loops (Rhino)
- [ ] Helpers from [lib/sme-common.js](lib/sme-common.js), not redefined per script
- [ ] Unit tests updated
- [ ] No numbered slot params in new code

---

## Decision tree

```
New save logic?
├─ Backend accepts flat payload? → thin script + serializeInputMap
├─ Repeatable lists? → getParameters().toArray() + loop
├─ Many checkbox enums? → mapEnumGroups / BUSINESS_PROFILE config
├─ >200 lines? → split or move mapping to Java
└─ New field reads? → GraphQL proxy (sme_graphql_api.js)
```

---

## Reference in this repo

| File | Role |
|------|------|
| [lib/sme-common.js](lib/sme-common.js) | Team helper source (copy into scripts) |
| [sme_zapisz_dane_beneficjentow.js](sme_zapisz_dane_beneficjentow.js) | Refactored save (1360 → 572 lines) |
| [sme_crbr_zapisz_dane_formularza.js](sme_crbr_zapisz_dane_formularza.js) | Thin adapter |
| [sme_graphql_api.js](sme_graphql_api.js) | Focused single-purpose service |
| [.cursor/rules/scriptcode-keep-short.mdc](.cursor/rules/scriptcode-keep-short.mdc) | AI rule for `*.js` |

// Operationele gegevens: the thematic flows (thema_type.csv) and their steps
// (concept schemes in operationeel_*.csv). See "Operationele gegevens" in the
// repository README for the semantics:
// - a thema concept points with vervolgstap to the first step (a concept scheme);
// - the concepts of a step are its fields; a field with vervolgstap leads to the next step;
// - broaderPartitive makes a field part of a composite field;
// - conditionPath/conditionValue make a field visible only for a given value;
// - related groups alternative variants of one logical field;
// - _ui_first/_ui_after order sibling fields (as ui-sort.ts in the POC does).

import fs from 'node:fs';
import type { CsvRecord } from './csv.js';
import { isDeclaredPrefix, isUrl, openCsv, prefixOf, sourceCsvFiles, sourceDir, splitValues } from './repo.js';
import { LIST_TYPES, NUMERIC_DATATYPES, ValidationError } from './rules.js';

export const THEMA_FILE = 'thema_type.csv';
export const THEMA_SCHEME = 'conceptscheme:thema_type';

/** Datatypes used for operational fields (the generic ones plus a period). */
export const OPERATIONAL_DATATYPES = [
    'xsd:string', 'xsd:decimal', 'xsd:integer', 'xsd:boolean', 'xsd:date', 'xsd:dateTime', 'xsd:duration', 'dcterms:temporal',
] as const;

export function isOperationalFile(file: string): boolean {
    return file === THEMA_FILE || /^operationeel_.*\.csv$/.test(file);
}

export function operationalFiles(): string[] {
    return sourceCsvFiles().filter(isOperationalFile);
}

export interface Located {
    file: string;
    /** 1-based line number in the CSV. */
    line: number;
    record: CsvRecord;
}

/** All rows of all source CSVs, indexed for the flow questions. */
export class Repo {
    readonly rows: Located[] = [];
    readonly byId = new Map<string, Located>();

    constructor() {
        for (const file of sourceCsvFiles()) {
            let csv;
            try {
                csv = openCsv(file);
            } catch {
                continue;
            }
            for (const row of csv.rows.filter(r => !r.blank)) {
                const located = { file, line: row.index + 1, record: row.record };
                this.rows.push(located);
                if (row.record._type && !this.byId.has(row.record._id)) this.byId.set(row.record._id, located);
            }
        }
    }

    label(id: string): string | undefined {
        return this.byId.get(id)?.record.prefLabel || undefined;
    }

    isScheme(id: string): boolean {
        return this.byId.get(id)?.record._type === 'skos:ConceptScheme';
    }

    isList(id: string): boolean {
        return LIST_TYPES.includes(this.byId.get(id)?.record._type ?? '');
    }

    /** Concepts in a scheme (inScheme), in CSV order. */
    conceptsOf(scheme: string): Located[] {
        return this.rows.filter(r => r.record.inScheme === scheme && r.record._type === 'skos:Concept');
    }

    /** Options of a concept scheme or members of a collection defined in this repo. */
    listMembers(list: string): Array<{ id: string; label?: string }> {
        const type = this.byId.get(list)?.record._type;
        const rows = type === 'skos:Collection'
            ? this.rows.filter(r => splitValues(r.record.collections).includes(list))
            : this.rows.filter(r => r.record.inScheme === list && r.record._type === 'skos:Concept');
        return rows.map(r => ({ id: r.record._id, label: r.record.prefLabel || this.label(r.record._id) }));
    }

    /**
     * A step has fields (datatype, code list, selection, parts or a next step);
     * a scheme whose concepts have none of these is a list of options.
     */
    isStep(scheme: string): boolean {
        return this.conceptsOf(scheme).some(c => {
            const r = c.record;
            return Boolean(r.relevantDataType || r.relevantCodeList || r.relevantRiepr || r.relevantClass || r.broaderPartitive || r.vervolgstap);
        });
    }

    /** Concept schemes defined in operationeel_*.csv. */
    operationalSchemes(): Located[] {
        return this.rows.filter(r => r.file !== THEMA_FILE && isOperationalFile(r.file) && r.record._type === 'skos:ConceptScheme');
    }

    themas(): Located[] {
        return this.rows.filter(r => r.file === THEMA_FILE && r.record._type === 'skos:Concept');
    }
}

// ---------------------------------------------------------------------------
// UI ordering (same rules as poc-flow-operationeel/src/services/ui-sort.ts)
// ---------------------------------------------------------------------------

function sortByUiOrder(fields: CsvRecord[]): CsvRecord[] {
    if (fields.length <= 1) return [...fields];
    const ids = new Set(fields.map(f => f._id));
    const first = fields.filter(f => f._ui_first === 'true');
    const ordered = fields.filter(f => f._ui_first !== 'true' && f._ui_after && ids.has(f._ui_after));
    const free = fields.filter(f => !first.includes(f) && !ordered.includes(f));

    // Kahn's algorithm over the _ui_after edges within `ordered`, stable on CSV order.
    const position = new Map(fields.map((f, i) => [f._id, i]));
    const pending = new Set(ordered.map(f => f._id));
    const sorted: CsvRecord[] = [];
    let progress = true;
    while (pending.size > 0 && progress) {
        progress = false;
        const ready = ordered
            .filter(f => pending.has(f._id) && !pending.has(f._ui_after))
            .sort((a, b) => (position.get(a._id) ?? 0) - (position.get(b._id) ?? 0));
        for (const f of ready) {
            pending.delete(f._id);
            sorted.push(f);
            progress = true;
        }
    }
    // A cycle leaves fields pending: keep them in CSV order (validate_flows reports it).
    sorted.push(...ordered.filter(f => pending.has(f._id)));
    return [...first, ...sorted, ...free];
}

/** Sibling fields in display order; fields shown on a condition come after their trigger. */
export function uiOrder(fields: CsvRecord[]): CsvRecord[] {
    const triggers = new Set(fields.filter(f => f.conditionPath && f.conditionValue).map(f => f.conditionPath));
    const dependent = fields.filter(f => f.conditionPath && triggers.has(f.conditionPath) && fields.some(t => t._id === f.conditionPath));
    const independent = fields.filter(f => !dependent.includes(f));
    return [...sortByUiOrder(independent), ...sortByUiOrder(dependent)];
}

// ---------------------------------------------------------------------------
// UI description of a step
// ---------------------------------------------------------------------------

export type Control =
    | 'group' | 'select' | 'multiselect' | 'feature-picker' | 'structural-picker' | 'structural-property'
    | 'checkbox' | 'date' | 'date-time' | 'date-range' | 'number' | 'duration' | 'text' | 'label-only';

const CONTROL_BY_DATATYPE: Record<string, Control> = {
    'xsd:boolean': 'checkbox',
    'xsd:date': 'date',
    'xsd:dateTime': 'date-time',
    'dcterms:temporal': 'date-range',
    'xsd:decimal': 'number',
    'xsd:integer': 'number',
    'xsd:double': 'number',
    'xsd:float': 'number',
    'xsd:duration': 'duration',
    'xsd:string': 'text',
};

interface Reference {
    id: string;
    label?: string;
}

export interface UiField {
    id: string;
    label: string;
    definition?: string;
    /** How a form renders the field (as in the POC with @domg-wc components). */
    control: Control;
    required?: true;
    /** May be added several times ("toevoegen" button; rendered once when also required). */
    repeatable?: true;
    hidden?: true;
    datatype?: string;
    /** Fixed unit, or the units to choose from. */
    unit?: { fixed?: Reference; choose?: Reference[]; from?: string };
    /** Options of a select; `from` is the code list. Options of published lists elsewhere are not listed. */
    options?: { from: string; items?: Reference[]; published?: true };
    /** Systems (or system types) to pick from, for pickers. */
    selects?: Reference[];
    /** Shown only when another field has a given value. */
    visibleWhen?: { field: string; fieldLabel?: string; equals: string; equalsLabel?: string };
    /** Alternative variants of the same logical field; shown as one group. */
    variantOf?: Reference[];
    /** Step(s) that follow once this field is filled in. */
    nextStep?: Reference[];
    /** Data model mapping. */
    semantics?: Record<string, string | string[]>;
    /** Raw ordering annotations. */
    order?: { first?: true; after?: string };
    parts?: UiField[];
    /** Problems that make the field unusable in a form. */
    issues?: string[];
}

function refs(repo: Repo, ids: string[]): Reference[] {
    return ids.map(id => ({ id, label: repo.label(id) }));
}

export function describeField(repo: Repo, field: Located, all: Located[]): UiField {
    const r = field.record;
    const children = uiOrder(all.filter(c => c.record.broaderPartitive === r._id).map(c => c.record))
        .map(c => all.find(a => a.record === c)!);
    const codeList = splitValues(r.relevantCodeList);
    const riepr = splitValues(r.relevantRiepr);
    const units = splitValues(r.relevantUnit);
    const issues: string[] = [];

    let control: Control;
    if (children.length > 0 && !r.relevantDataType && codeList.length === 0) control = 'group';
    else if (codeList.length > 0) control = r.isMultiselect === 'true' ? 'multiselect' : 'select';
    else if (riepr.length > 0 && !r.relevantDataType) {
        const eigenschap = riepr.some(id => /-eigenschappen:/.test(id));
        control = eigenschap ? 'structural-property' : r.relevantClass === 'sosa:FeatureOfInterest' ? 'feature-picker' : 'structural-picker';
    } else if (r.relevantDataType) control = CONTROL_BY_DATATYPE[r.relevantDataType] ?? 'text';
    else {
        control = 'label-only';
        issues.push('no datatype, code list, selection or parts: there is nothing to fill in');
    }

    const ui: UiField = {
        id: r._id,
        label: r.prefLabel,
        definition: r.definition || undefined,
        control,
        required: r.isVerplicht === 'true' || undefined,
        repeatable: r.isMeervoudig === 'true' || undefined,
        hidden: r.isOnzichtbaar === 'true' || undefined,
        datatype: r.relevantDataType || undefined,
    };
    if (units.length === 1 && !repo.isList(units[0])) ui.unit = { fixed: refs(repo, units)[0] };
    else if (units.length === 1) ui.unit = { from: units[0], choose: refs(repo, repo.listMembers(units[0]).map(m => m.id)) };
    else if (units.length > 1) ui.unit = { choose: refs(repo, units) };
    for (const unit of units) if (/TODO/i.test(unit)) issues.push(`unit is a placeholder (${unit})`);
    if (codeList.length > 0) {
        const list = codeList[0];
        ui.options = repo.isList(list)
            ? { from: list, items: repo.listMembers(list) }
            : { from: list, published: true };
        if (/TODO/i.test(list)) issues.push(`code list is a placeholder (${list})`);
    }
    if (riepr.length > 0) ui.selects = refs(repo, riepr);
    if (r.conditionPath) {
        ui.visibleWhen = {
            field: r.conditionPath,
            fieldLabel: repo.label(r.conditionPath),
            equals: r.conditionValue,
            equalsLabel: repo.label(r.conditionValue),
        };
    }
    const related = splitValues(r.related);
    if (related.length) ui.variantOf = refs(repo, related);
    const next = splitValues(r.vervolgstap);
    if (next.length) ui.nextStep = refs(repo, next);
    const semantics: Record<string, string | string[]> = {};
    for (const key of ['relevantClass', 'relevantFeatureClass', 'relation', 'kwantiteitsAspect', 'drager', 'soortWaartbepaling', 'variabele']) {
        if (r[key]) semantics[key] = splitValues(r[key]).length > 1 ? splitValues(r[key]) : r[key];
    }
    if (Object.keys(semantics).length) ui.semantics = semantics;
    if (r._ui_first === 'true' || r._ui_after) ui.order = { first: r._ui_first === 'true' || undefined, after: r._ui_after || undefined };
    if (children.length) ui.parts = children.map(c => describeField(repo, c, all));
    if (issues.length) ui.issues = issues;
    return ui;
}

function stepFields(repo: Repo, scheme: string): UiField[] {
    const all = repo.conceptsOf(scheme);
    const ids = new Set(all.map(a => a.record._id));
    const top = all.filter(a => !a.record.broaderPartitive || !ids.has(a.record.broaderPartitive));
    return uiOrder(top.map(t => t.record)).map(rec => describeField(repo, all.find(a => a.record === rec)!, all));
}

/** Resolves a scheme by id or by a name such as "operationeel_lucht_bron" or "lucht_bron". */
function resolveScheme(repo: Repo, step: string): Located {
    const candidates = step.includes(':') ? [step] : [`conceptscheme:${step}`, `conceptscheme:operationeel_${step}`];
    for (const id of candidates) {
        const found = repo.byId.get(id);
        if (found?.record._type === 'skos:ConceptScheme' && isOperationalFile(found.file)) return found;
    }
    throw new ValidationError(`'${step}' is not a step (concept scheme) in an operationeel_*.csv file. Use list_flows or get_flow to find the steps.`);
}

export function getStep({ step }: { step: string }) {
    const repo = new Repo();
    const scheme = resolveScheme(repo, step);
    const id = scheme.record._id;
    const incoming = repo.rows.filter(r => splitValues(r.record.vervolgstap).includes(id)).map(r => ({ id: r.record._id, label: r.record.prefLabel, file: `src/source/${r.file}` }));
    const usedAsList = repo.rows.filter(r => splitValues(r.record.relevantCodeList).includes(id)).map(r => r.record._id);
    return {
        id,
        label: scheme.record.prefLabel || undefined,
        file: `src/source/${scheme.file}`,
        reachedFrom: incoming,
        usedAsCodeListBy: usedAsList.length ? usedAsList : undefined,
        fields: stepFields(repo, id),
        legend: CONTROL_LEGEND,
    };
}

const CONTROL_LEGEND: Record<Control, string> = {
    group: 'Composite field: a group of its parts (vl-form-grid); with repeatable a "toevoegen" button per copy.',
    select: 'Dropdown (vl-select) with the options of the code list.',
    multiselect: 'Multi-select dropdown (vl-select multiple).',
    'feature-picker': 'Select the system(s) (sosa:FeatureOfInterest) active in the production year on which to report; later steps report on that selection.',
    'structural-picker': 'Select systems of the given types (relevantRiepr) active in the production year.',
    'structural-property': 'Value taken from a structural eigenschap of the selected system (relevantRiepr points to an eigenschap).',
    checkbox: 'Checkbox (vl-checkbox).',
    date: 'Date picker (vl-datepicker).',
    'date-time': 'Date and time picker (vl-datepicker type="date-time").',
    'date-range': 'Period picker (vl-datepicker type="range").',
    number: 'Number input (vl-input-field type="number"), with the unit as suffix or a unit dropdown.',
    duration: 'Duration input dd:hh:mm:ss (vl-input-field with pattern).',
    text: 'Text input (vl-input-field).',
    'label-only': 'Nothing to fill in (incomplete definition).',
};

// ---------------------------------------------------------------------------
// Flows
// ---------------------------------------------------------------------------

interface StepSummary {
    number: number;
    id: string;
    label?: string;
    file: string;
    reachedVia: Reference[];
}

function walk(repo: Repo, entry: string[]): StepSummary[] {
    const steps: StepSummary[] = [];
    const queue = entry.map(id => ({ id, via: [] as Reference[] }));
    while (queue.length) {
        const { id, via } = queue.shift()!;
        const existing = steps.find(s => s.id === id);
        if (existing) {
            existing.reachedVia.push(...via);
            continue;
        }
        const scheme = repo.byId.get(id);
        if (!scheme || scheme.record._type !== 'skos:ConceptScheme') continue;
        steps.push({ number: steps.length + 1, id, label: scheme.record.prefLabel || undefined, file: `src/source/${scheme.file}`, reachedVia: via });
        for (const concept of repo.conceptsOf(id)) {
            for (const next of splitValues(concept.record.vervolgstap)) {
                if (repo.isScheme(next)) queue.push({ id: next, via: [{ id: concept.record._id, label: concept.record.prefLabel }] });
            }
        }
    }
    return steps;
}

function outlineField(field: UiField, steps: StepSummary[], indent: string): string[] {
    const flags = [
        field.control,
        field.required && 'verplicht',
        field.repeatable && 'meervoudig',
        field.hidden && 'onzichtbaar',
        field.unit?.fixed && `eenheid ${field.unit.fixed.label ?? field.unit.fixed.id}`,
        field.unit?.choose && 'eenheid kiezen',
        field.options && `opties uit ${field.options.from}`,
        field.selects && `kies uit ${field.selects.map(s => s.label ?? s.id).join(', ')}`,
    ].filter(Boolean).join(', ');
    let line = `${indent}- ${field.label} (${flags})`;
    if (field.visibleWhen) line += ` [enkel als ${field.visibleWhen.fieldLabel ?? field.visibleWhen.field} = ${field.visibleWhen.equalsLabel ?? field.visibleWhen.equals}]`;
    if (field.nextStep) line += ` → ${field.nextStep.map(n => `stap ${steps.find(s => s.id === n.id)?.number ?? '?'} (${n.id})`).join(', ')}`;
    if (field.issues) line += ` ⚠ ${field.issues.join('; ')}`;
    return [line, ...(field.parts ?? []).flatMap(p => outlineField(p, steps, `${indent}  `))];
}

function resolveThema(repo: Repo, flow: string): Located | undefined {
    const q = flow.trim().toLowerCase();
    return repo.themas().find(t => [t.record._id, t.record._id.split(':')[1], t.record.prefLabel, t.record.notation]
        .some(v => v?.toLowerCase() === q));
}

export function listFlows() {
    const repo = new Repo();
    const reached = new Set<string>();
    const flows = repo.themas().map(thema => {
        const entry = splitValues(thema.record.vervolgstap);
        const steps = walk(repo, entry);
        steps.forEach(s => reached.add(s.id));
        return {
            id: thema.record._id,
            label: thema.record.prefLabel,
            notation: thema.record.notation || undefined,
            entryStep: entry,
            steps: steps.map(s => ({ number: s.number, id: s.id, label: s.label })),
        };
    });
    const codeLists = new Set(repo.rows.flatMap(r => [...splitValues(r.record.relevantCodeList), ...splitValues(r.record.relevantUnit)]));
    const summary = (s: Located) => ({ id: s.record._id, label: s.record.prefLabel || undefined, file: `src/source/${s.file}` });
    const unreachable: Array<ReturnType<typeof summary> & { leadsTo: string[] }> = [];
    for (const s of repo.operationalSchemes().filter(s => repo.isStep(s.record._id))) {
        if (reached.has(s.record._id)) continue;
        const sub = walk(repo, [s.record._id]).map(x => x.id);
        sub.forEach(id => reached.add(id));
        unreachable.push({ ...summary(s), leadsTo: sub.slice(1) });
    }
    const lists = repo.operationalSchemes().filter(s => !repo.isStep(s.record._id));
    const unregistered = fs.readdirSync(sourceDir()).filter(f => isOperationalFile(f) && !sourceCsvFiles().includes(f));
    return {
        flows,
        stepsNotReachableFromAThema: unreachable.length ? unreachable : undefined,
        optionLists: lists.filter(s => codeLists.has(s.record._id)).map(summary),
        unusedOptionLists: lists.filter(s => !codeLists.has(s.record._id)).map(summary),
        filesNotInConfig: unregistered.length ? unregistered : undefined,
        note: 'A flow starts at the thema (thema_type.csv), whose vervolgstap is the first step; fields with vervolgstap lead to the next step. Use get_flow for the full outline and get_step for the form of one step.',
    };
}

export function getFlow({ flow }: { flow: string }) {
    const repo = new Repo();
    const thema = resolveThema(repo, flow);
    const entry = thema ? splitValues(thema.record.vervolgstap) : [resolveScheme(repo, flow).record._id];
    const steps = walk(repo, entry);
    const details = steps.map(step => ({ ...step, fields: stepFields(repo, step.id) }));
    const outline = [
        thema ? `Thema: ${thema.record.prefLabel} (${thema.record._id})` : `Start bij ${entry.join(', ')} (niet gekoppeld aan een thema)`,
        ...details.flatMap(step => [
            '',
            `Stap ${step.number}: ${step.label ? `${step.label} (${step.id})` : step.id}${step.reachedVia.length ? ` ← via ${step.reachedVia.map(v => v.label ?? v.id).join(', ')}` : ''}`,
            ...step.fields.flatMap(f => outlineField(f, steps, '  ')),
        ]),
    ].join('\n');
    return {
        thema: thema ? { id: thema.record._id, label: thema.record.prefLabel, notation: thema.record.notation || undefined } : undefined,
        outline,
        steps: details,
    };
}

export function getOperationalConcept({ concept }: { concept: string }) {
    const repo = new Repo();
    const located = repo.byId.get(concept) ?? repo.rows.find(r => isOperationalFile(r.file) && r.record._type === 'skos:Concept'
        && (r.record._id.split(':')[1] === concept || r.record.prefLabel?.toLowerCase() === concept.toLowerCase()));
    if (!located || !isOperationalFile(located.file)) {
        throw new ValidationError(`'${concept}' is not a concept in thema_type.csv or operationeel_*.csv. Use search_codelists to find it.`);
    }
    const r = located.record;
    const record = Object.fromEntries(Object.entries(r).filter(([, v]) => v));
    const incoming = repo.rows
        .filter(x => x.record._id !== r._id)
        .flatMap(x => Object.entries(x.record)
            .filter(([column, value]) => column !== '_id' && splitValues(value).includes(r._id))
            .map(([column]) => ({ id: x.record._id, column, file: `src/source/${x.file}`, line: x.line })));
    const all = r._type === 'skos:Concept' && r.inScheme ? repo.conceptsOf(r.inScheme) : [];
    return {
        file: `src/source/${located.file}`,
        line: located.line,
        record,
        step: r.inScheme || undefined,
        ui: r._type === 'skos:Concept' && r.inScheme !== THEMA_SCHEME ? describeField(repo, located, all) : undefined,
        referencedBy: incoming,
    };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function validateFlows() {
    const repo = new Repo();
    const issues: Array<{ level: 'error' | 'warning'; location: string; message: string }> = [];
    const report = (level: 'error' | 'warning', at: Located, message: string) =>
        issues.push({ level, location: `src/source/${at.file}:${at.line}`, message: `${at.record._id}: ${message}` });

    for (const at of repo.rows.filter(r => isOperationalFile(r.file) && r.record._type === 'skos:Concept')) {
        const r = at.record;
        for (const next of splitValues(r.vervolgstap)) {
            if (!isUrl(next) && !repo.isScheme(next)) report('error', at, `vervolgstap ${next} is not a concept scheme.`);
        }
        if (at.file === THEMA_FILE) continue;
        const siblings = repo.conceptsOf(r.inScheme).filter(s => s.record.broaderPartitive === r.broaderPartitive);
        if (r.broaderPartitive && !repo.byId.has(r.broaderPartitive)) report('error', at, `broaderPartitive ${r.broaderPartitive} does not exist.`);
        if (Boolean(r.broaderPartitive) === Boolean(r.topConceptOf)) report('warning', at, 'a field has either topConceptOf (top level) or broaderPartitive (part), not both/neither.');
        if (r.conditionPath && !repo.byId.has(r.conditionPath)) report('error', at, `conditionPath ${r.conditionPath} does not exist.`);
        if (Boolean(r.conditionPath) !== Boolean(r.conditionValue)) report('warning', at, 'conditionPath and conditionValue go together.');
        if (r._ui_after) {
            if (!siblings.some(s => s.record._id === r._ui_after)) report('warning', at, `_ui_after ${r._ui_after} is not a sibling field, so it has no effect.`);
            if (r._ui_first === 'true') report('warning', at, '_ui_first and _ui_after together: _ui_first wins.');
        }
        for (const id of splitValues(r.related)) {
            const other = repo.byId.get(id);
            if (!other) report('error', at, `related ${id} does not exist.`);
            else if (!splitValues(other.record.related).includes(r._id)) report('warning', at, `related ${id} does not list ${r._id} back.`);
        }
        for (const list of splitValues(r.relevantCodeList)) {
            if (/TODO/i.test(list)) report('warning', at, `relevantCodeList is a placeholder (${list}).`);
            else if (['conceptscheme', 'collectie'].includes(prefixOf(list) ?? '') && !repo.isList(list)) report('error', at, `relevantCodeList ${list} does not exist in this repo.`);
        }
        if (r.variabele) {
            const selector = repo.byId.get(r.variabele);
            if (!selector) report('error', at, `variabele ${r.variabele} does not exist.`);
            else if (selector.record.inScheme !== r.inScheme) report('error', at, `variabele ${r.variabele} is not a field of the same step.`);
            else if (!selector.record.relevantCodeList) report('warning', at, `variabele ${r.variabele} has no relevantCodeList to select the stof.`);
        }
        for (const unit of splitValues(r.relevantUnit)) if (/TODO/i.test(unit)) report('warning', at, `relevantUnit is a placeholder (${unit}).`);
        if (r.relevantUnit && r.relevantDataType && !NUMERIC_DATATYPES.includes(r.relevantDataType)) report('warning', at, `unit on a non-numeric datatype (${r.relevantDataType}).`);
        for (const [column, value] of Object.entries(r)) {
            for (const part of splitValues(value)) {
                const prefix = prefixOf(part);
                if (prefix && /^[a-zA-Z0-9_/.:-]+$/.test(part.slice(prefix.length + 1)) && !isDeclaredPrefix(prefix)) {
                    report('error', at, `${column}: prefix '${prefix}:' is not declared in config.yml.`);
                }
            }
        }
    }

    // _ui_after cycles and several _ui_first among siblings.
    const groups = new Map<string, Located[]>();
    for (const at of repo.rows.filter(r => isOperationalFile(r.file) && r.file !== THEMA_FILE && r.record._type === 'skos:Concept')) {
        const key = `${at.record.inScheme}|${at.record.broaderPartitive}`;
        groups.set(key, [...(groups.get(key) ?? []), at]);
    }
    for (const siblings of groups.values()) {
        const firsts = siblings.filter(s => s.record._ui_first === 'true');
        if (firsts.length > 1) report('warning', firsts[1], `several siblings have _ui_first (${firsts.map(f => f.record._id).join(', ')}).`);
        for (const start of siblings) {
            const seen = new Set<string>();
            let current: CsvRecord | undefined = start.record;
            while (current?._ui_after && !seen.has(current._id)) {
                seen.add(current._id);
                const afterId: string = current._ui_after;
                current = siblings.find(s => s.record._id === afterId)?.record;
            }
            if (current && seen.has(current._id) && current._id === start.record._id) report('error', start, '_ui_after forms a cycle.');
        }
    }

    const flows = listFlows();
    for (const step of flows.stepsNotReachableFromAThema ?? []) {
        const at = repo.byId.get(step.id)!;
        issues.push({ level: 'warning', location: `src/source/${at.file}:${at.line}`, message: `step ${step.id} is not reachable from any thema (no vervolgstap leads to it).` });
    }
    for (const list of flows.unusedOptionLists) {
        const at = repo.byId.get(list.id)!;
        issues.push({ level: 'warning', location: `src/source/${at.file}:${at.line}`, message: `option list ${list.id} is not used as relevantCodeList anywhere.` });
    }
    for (const file of flows.filesNotInConfig ?? []) {
        issues.push({ level: 'error', location: `src/source/${file}`, message: 'not listed in source.codelijst_csv of config.yml, so it is not generated or published.' });
    }
    return {
        errors: issues.filter(i => i.level === 'error').length,
        warnings: issues.filter(i => i.level === 'warning').length,
        issues,
    };
}

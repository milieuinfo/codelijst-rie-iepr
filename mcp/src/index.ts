#!/usr/bin/env node
// MCP server for querying and managing the systeemtype and eigenschappen code
// lists of codelijst-rie-iepr (src/source/<systeem>_type.csv and <systeem>_eigenschappen.csv).

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { addField, addFlow, addFlowCollection, addStep, deleteField, deleteStep, reorderFields, updateFlowItem } from './flows-edit.js';
import { getFlow, getOperationalConcept, getStep, listFlows, OPERATIONAL_DATATYPES, validateFlows } from './flows.js';
import { addProperty, deleteProperty, listProperties, updateProperty, type CodeListSource } from './eigenschappen.js';
import {
    addSelectionList, deleteSelectionList, findCodeLists, removeListEntries, updateSelectionList,
} from './lists.js';
import { runGenerateSkos, validatedWrite } from './pipeline.js';
import { getProperty, getTypeProperties, searchCodelists } from './query.js';
import { SYSTEMS } from './repo.js';
import { DATATYPES, KNOWN_RELATIONS, ValidationError } from './rules.js';
import { addType, deleteType, listTypes, updateType } from './systeemtypes.js';
import { validate } from './validate.js';

const server = new McpServer(
    { name: 'codelijst-rie-iepr', version: '0.2.0' },
    {
        instructions:
            'Answers questions about and manages the systeemtypes (<systeem>_type.csv) and eigenschappen (<systeem>_eigenschappen.csv) ' +
            `code lists for the systems ${SYSTEMS.join(', ')}, including the inline selection lists they use, and the ` +
            'operationele flows (thema_type.csv, operationeel_*.csv: themas, steps, fields and the form they produce). ' +
            'Always look at the existing entries first, run every write tool with dryRun=true, show the preview to the user, ' +
            'and only then write with dryRun=false. Every real write is validated with `npm run generate_skos` and rolled back when it fails. ' +
            'Identifiers are published URIs and cannot be renamed; deleted concepts are published as withdrawn. ' +
            'All labels and definitions are in Dutch.',
    },
);

// ---------------------------------------------------------------------------
// Shared schemas and helpers
// ---------------------------------------------------------------------------

const system = z.enum(SYSTEMS).describe('The system (systeem) whose code list to use.');
const dryRun = z.boolean().default(true).describe(
    'Preview the change without writing. Defaults to true; set false only after the user confirmed the preview. ' +
    'A real write is validated with `npm run generate_skos` and rolled back if that fails.',
);
const code = z.string().describe('Local part of the identifier in lowercase snake_case, without prefix (e.g. "directe_stookinstallatie").');
const prefLabel = z.string().describe('Dutch label starting with a capital letter (e.g. "Directe stookinstallatie").');
const definition = z.string().describe('Dutch definition: one full sentence ending with a period.');
const datatype = z.enum(DATATYPES).describe('relevantDataType for a free-input value.');
const relation = z.string().describe(`How the value relates to the property, default rdfs:value. Usual: ${KNOWN_RELATIONS.join(', ')}.`);
const relevantProperty = z.string().describe('External property this corresponds to, e.g. dbo:height, dbo:depth, dbo:diameter.');
const appliesTo = z.array(z.string()).describe('relevantRiepr: types from <systeem>_type.csv (code or CURIE) this property applies to, or ["all"] for every type.');
const unit = z.array(z.string()).describe('relevantUnit for numeric datatypes: a CSOR unit like csor_eenheid:E_59 (m), or a collectie of units to choose from.');
const codeList = z.array(z.string()).describe('relevantCodeList: concept scheme(s) or collection(s) to select from.');
const codeListSource = z.enum(['published', 'inline']).describe('Whether codeList is an already published list or one defined inline in the eigenschappen CSV. Ask the user when unsure.');
const readOnly = { readOnlyHint: true };
const destructive = { destructiveHint: true };

function json(value: unknown): CallToolResult {
    return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

function respond<A>(fn: (args: A) => unknown): (args: A) => Promise<CallToolResult> {
    return async args => {
        try {
            return json(await fn(args));
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const prefix = error instanceof ValidationError ? 'Validation failed, nothing was written:\n' : 'Error: ';
            return { isError: true, content: [{ type: 'text', text: prefix + message }] };
        }
    };
}

/** Real writes are validated with the generator and rolled back on failure. */
function write<A extends { dryRun?: boolean }, R>(fn: (args: A) => R | Promise<R>): (args: A) => Promise<unknown> {
    return async args => (args.dryRun === false ? validatedWrite(() => fn(args)) : fn(args));
}

/**
 * Uses MCP elicitation, when the client supports it, to let the user decide
 * whether a code list is already published or should be created inline.
 */
async function askCodeListSource(lists: string[]): Promise<CodeListSource | undefined> {
    if (!server.server.getClientCapabilities()?.elicitation) return undefined;
    const answer = await server.server.elicitInput({
        message: `Is ${lists.join(', ')} an already published code list, or should it be created in the eigenschappen CSV?`,
        requestedSchema: {
            type: 'object',
            properties: {
                codeListSource: {
                    type: 'string',
                    title: 'Code list source',
                    enum: ['published', 'inline'],
                    enumNames: ['Already published (reference it)', 'New list in the eigenschappen CSV'],
                },
            },
            required: ['codeListSource'],
        },
    });
    const value = answer.action === 'accept' ? answer.content?.codeListSource : undefined;
    return value === 'published' || value === 'inline' ? value : undefined;
}

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

server.registerTool('list_types', {
    title: 'List systeemtypes',
    description:
        'List the types in <systeem>_type.csv with their labels, definitions and broader type, e.g. to answer "Welke typen ' +
        'installaties bestaan er?" (subtypes have a broader; isOnzichtbaar types are structural and not offered to users). ' +
        'Also call this before adding, editing or deleting a type.',
    inputSchema: { system },
    annotations: readOnly,
}, respond(({ system }) => listTypes(system)));

server.registerTool('list_properties', {
    title: 'List eigenschappen',
    description:
        'List the eigenschappen in <systeem>_eigenschappen.csv: top-level properties, composite properties with their parts, ' +
        'the types each applies to (relevantRiepr), datatypes, units, code lists, and the inline concept schemes/collections ' +
        'defined in the same file. Use these as examples before adding a property, and to find what to edit or delete.',
    inputSchema: { system },
    annotations: readOnly,
}, respond(({ system }) => listProperties(system)));

server.registerTool('get_type_properties', {
    title: 'Eigenschappen van een type',
    description:
        'Answer "Wat zijn de eigenschappen van een <type>?": resolves a type by label, code or CURIE (e.g. "fakkel", ' +
        '"directe stookinstallatie", "installatie:fakkel") across all systems and returns every eigenschap that applies to it, ' +
        'directly, inherited from a broader type, or because it applies to all types of the system, including composite ' +
        'parts, datatypes, units and the options of selection lists. Properties that only apply to its subtypes are listed separately.',
    inputSchema: {
        type: z.string().describe('Type label, code or CURIE as the user wrote it, e.g. "fakkel".'),
        system: system.optional().describe('Restrict the lookup to one system when the name is ambiguous.'),
    },
    annotations: readOnly,
}, respond(args => getTypeProperties(args)));

server.registerTool('get_property', {
    title: 'Details van een eigenschap',
    description:
        'Answer questions about one eigenschap, e.g. "Welke installaties hebben een geïnstalleerd vermogen?" or "Welke ' +
        'lozingsplaatsen kan ik kiezen?": resolves it by label, code or CURIE and returns its definition, datatype, unit, ' +
        'selection options, parts, and all types it applies to (including subtypes).',
    inputSchema: {
        property: z.string().describe('Property label, code or CURIE, e.g. "lozingsplaats".'),
        system: system.optional(),
    },
    annotations: readOnly,
}, respond(args => getProperty(args)));

server.registerTool('search_codelists', {
    title: 'Zoeken in types en eigenschappen',
    description:
        'Free-text search (case- and accent-insensitive) over types, eigenschappen and selection options of all six systems, ' +
        'and over the operationele themas, steps and fields (kind=operational; not combined with system). ' +
        'Use it when a name does not resolve directly or to find where a term is used.',
    inputSchema: {
        query: z.string(),
        system: system.optional(),
        kind: z.enum(['all', 'type', 'property', 'option', 'operational']).default('all'),
    },
    annotations: readOnly,
}, respond(args => searchCodelists(args)));

server.registerTool('find_code_lists', {
    title: 'Find code lists',
    description:
        'Find concept schemes and collections that a property could use as codeList: those defined in this repo, those ' +
        'referenced from outside it, and optionally (searchPublished=true) those published on data.omgeving.vlaanderen.be.',
    inputSchema: {
        query: z.string().optional().describe('Case-insensitive text to match ids and labels.'),
        searchPublished: z.boolean().default(false).describe('Also search the public SPARQL endpoint (needs network).'),
    },
    annotations: { ...readOnly, openWorldHint: true },
}, respond(args => findCodeLists(args)));

server.registerTool('validate_codelists', {
    title: 'Validate type and eigenschappen CSVs',
    description:
        'Quick check of the type and eigenschappen CSVs: column counts, duplicate ids, unresolved references (broader, ' +
        'broaderPartitive, relevantRiepr, collections), undeclared prefixes and missing datatypes/definitions.',
    inputSchema: { system: system.optional().describe('Limit to one system; omit for all.') },
    annotations: readOnly,
}, respond(({ system }) => validate(system ? [system] : SYSTEMS)));

server.registerTool('generate_skos', {
    title: 'Run npm run generate_skos',
    description:
        'Run the full generator (`npm run generate_skos` in the repo root): checks prefixes and relevantRiepr references, ' +
        'regenerates all output formats and runs SHACL validation. The write tools already run it after every change; ' +
        'use this to check the current state, e.g. after a manual edit.',
    inputSchema: {},
}, respond(async () => {
    const { ok, exitCode, durationMs, summary } = await runGenerateSkos();
    if (!ok) throw new Error(`npm run generate_skos failed (exit ${exitCode}).\n\n${summary}`);
    return { ok, durationMs, summary };
}));

// ---------------------------------------------------------------------------
// Systeemtypes
// ---------------------------------------------------------------------------

server.registerTool('add_type', {
    title: 'Add a systeemtype',
    description:
        'Add a type (skos:Concept) to <systeem>_type.csv. The id becomes <systeem>:<code>; a top-level type gets ' +
        'topConceptOf=conceptscheme:<systeem>_type, a subtype gets broader=<parent> instead. isMeetbaar defaults to true ' +
        '(every systeemtype so far is meetbaar); set isOnzichtbaar only for structural types users should not pick. ' +
        'Set isAanpasbaar when the type of an existing system may still be changed afterwards (e.g. the subtypes of ' +
        'emissiepunt:emissiepunt_lucht, which used to be a selection eigenschap "Type emissiepunt").',
    inputSchema: {
        system,
        code,
        prefLabel,
        definition,
        broader: z.string().optional().describe('Existing type this is a subtype of (code or CURIE, e.g. "stookinstallatie").'),
        altLabel: z.string().optional(),
        scopeNote: z.string().optional(),
        isOnzichtbaar: z.boolean().default(false),
        isMeetbaar: z.boolean().default(true),
        isAanpasbaar: z.boolean().default(false).describe('The type of an existing system may still be changed afterwards.'),
        dryRun,
    },
}, respond(write(args => addType(args))));

server.registerTool('update_type', {
    title: 'Edit a systeemtype',
    description:
        'Change fields of an existing type in <systeem>_type.csv. Only the fields in `set` change; null clears a field. ' +
        'Setting or clearing broader moves it below another type or makes it a top-level type. The code (and so the URI) ' +
        'cannot change: to rename, add a new type and delete the old one.',
    inputSchema: {
        system,
        type: z.string().describe('The type to edit (code or CURIE).'),
        set: z.object({
            prefLabel: prefLabel.optional(),
            definition: definition.optional(),
            altLabel: z.string().nullable().optional(),
            scopeNote: z.string().nullable().optional(),
            broader: z.string().nullable().optional().describe('New broader type, or null to make it a top-level type.'),
            isOnzichtbaar: z.boolean().optional(),
            isMeetbaar: z.boolean().optional(),
            isAanpasbaar: z.boolean().optional(),
        }),
        dryRun,
    },
}, respond(write(args => updateType(args))));

server.registerTool('delete_type', {
    title: 'Delete a systeemtype',
    description:
        'Remove a type from <systeem>_type.csv; after publication it is marked withdrawn. Refused while the type has ' +
        'subtypes or is referenced elsewhere (e.g. operationele codelijsten). Eigenschappen that list it in relevantRiepr ' +
        'block the delete unless removeFromProperties=true, which removes it from them (an eigenschap that would apply to no ' +
        'type is never left behind). Confirm with the user before deleting.',
    inputSchema: {
        system,
        type: z.string().describe('The type to delete (code or CURIE).'),
        removeFromProperties: z.boolean().default(false).describe('Also remove the type from relevantRiepr of eigenschappen in the same system.'),
        dryRun,
    },
    annotations: destructive,
}, respond(write(args => deleteType(args))));

// ---------------------------------------------------------------------------
// Eigenschappen
// ---------------------------------------------------------------------------

server.registerTool('add_property', {
    title: 'Add an eigenschap',
    description:
        'Add a property (eigenschap) to <systeem>_eigenschappen.csv. The id becomes <systeem>-eigenschappen:<code>.\n' +
        '- Simple value: give datatype (and unit for numbers); relation defaults to rdfs:value.\n' +
        '- Selection: give codeList instead of datatype, plus codeListSource. If you do not know whether the list is ' +
        'already published, ASK THE USER: \'published\' references an existing list (see find_code_lists), \'inline\' ' +
        'means a new conceptscheme/collection in the same CSV that you create first with add_selection_list.\n' +
        '- Composite (several fields filled in together, e.g. naam + diepte): add the parent with composite=true ' +
        '(usually isMeervoudig=true), then each part with parent=<parent code> and code <parent>_<part>.\n' +
        'Top-level properties need appliesTo (relevantRiepr): the types they apply to, or "all". A composite may instead carry appliesTo on each of its parts (broaderPartitive points from part to composite).',
    inputSchema: {
        system,
        code,
        prefLabel,
        definition,
        appliesTo: appliesTo.default([]).describe(`${appliesTo.description} Required for top-level properties, optional for parts.`),
        parent: z.string().optional().describe('Composite property this is a part of (code or CURIE); sets broaderPartitive.'),
        composite: z.boolean().default(false).describe('True for a composite property that only groups parts.'),
        datatype: datatype.optional(),
        relation: relation.optional(),
        relevantProperty: relevantProperty.optional(),
        unit: unit.default([]),
        codeList: codeList.default([]),
        codeListSource: codeListSource.optional(),
        isVerplicht: z.boolean().default(false),
        isMeervoudig: z.boolean().default(false),
        isMultiselect: z.boolean().default(false).describe('Allow selecting several values from codeList.'),
        altLabel: z.string().optional(),
        scopeNote: z.string().optional(),
        dryRun,
    },
}, respond(write(args => addProperty(args, { askCodeListSource }))));

server.registerTool('update_property', {
    title: 'Edit an eigenschap',
    description:
        'Change fields of an existing eigenschap in <systeem>_eigenschappen.csv. Only the fields in `set` change; null clears ' +
        'a field (e.g. datatype: null together with a new codeList to turn a value into a selection). A new codeList needs ' +
        'codeListSource (ask the user whether it is published or inline). Setting parent moves a part to another composite. ' +
        'The code (and so the URI) cannot change: to rename, add a new eigenschap and delete the old one.',
    inputSchema: {
        system,
        property: z.string().describe('The eigenschap to edit (code or CURIE).'),
        set: z.object({
            prefLabel: prefLabel.optional(),
            definition: definition.optional(),
            altLabel: z.string().nullable().optional(),
            scopeNote: z.string().nullable().optional(),
            appliesTo: appliesTo.optional().describe(`${appliesTo.description} Replaces the current list.`),
            parent: z.string().optional().describe('Move this part to another composite.'),
            datatype: datatype.nullable().optional(),
            relation: relation.nullable().optional(),
            relevantProperty: relevantProperty.nullable().optional(),
            unit: unit.nullable().optional().describe(`${unit.description} Replaces the current units; null clears them.`),
            codeList: codeList.nullable().optional().describe(`${codeList.description} Replaces the current lists; null clears them.`),
            codeListSource: codeListSource.optional(),
            isVerplicht: z.boolean().optional(),
            isMeervoudig: z.boolean().optional(),
            isMultiselect: z.boolean().optional(),
        }),
        dryRun,
    },
}, respond(write(args => updateProperty(args, { askCodeListSource }))));

server.registerTool('delete_property', {
    title: 'Delete an eigenschap',
    description:
        'Remove an eigenschap from <systeem>_eigenschappen.csv; a composite is removed together with its parts. After ' +
        'publication it is marked withdrawn. Refused while other rows reference it. Inline selection lists that nothing ' +
        'uses afterwards are reported, and removed too with deleteUnusedLists=true. Confirm with the user before deleting.',
    inputSchema: {
        system,
        property: z.string().describe('The eigenschap to delete (code or CURIE).'),
        deleteUnusedLists: z.boolean().default(false).describe('Also delete inline lists that only this eigenschap used.'),
        dryRun,
    },
    annotations: destructive,
}, respond(write(args => deleteProperty(args))));

// ---------------------------------------------------------------------------
// Inline selection lists
// ---------------------------------------------------------------------------

server.registerTool('add_selection_list', {
    title: 'Add an inline selection list',
    description:
        'Create (or with extend=true, add entries to) a selection list inside <systeem>_eigenschappen.csv, for use as ' +
        'codeList (or unit) of a property. Only use this when the user confirmed the list is NOT already published.\n' +
        '- kind=conceptscheme: new options defined here. Id conceptscheme:<systeem>_<name>; options get the prefix ' +
        '<systeem>-selectiemogelijkheden: (declared in config.yml and README.md if needed).\n' +
        '- kind=collection: a subset of existing published concepts (e.g. CSOR stoffen or eenheden). Id collectie:<name>; ' +
        'members are listed through the collections column.',
    inputSchema: {
        system,
        kind: z.enum(['conceptscheme', 'collection']),
        name: z.string().describe('Name in snake_case (e.g. "lozingsplaats", "verwijderingsrendement_stoffen"), or the full CURIE.'),
        prefLabel: prefLabel.optional().describe('Dutch label of the list (required unless extend=true).'),
        definition: definition.optional(),
        concepts: z.array(z.object({ code, prefLabel, definition })).default([]).describe('Options of a conceptscheme.'),
        members: z.array(z.string()).default([]).describe('Members of a collection: CURIEs or URLs of existing concepts, e.g. csor_variabele:V_2217.'),
        extend: z.boolean().default(false).describe('Add concepts/members to an existing inline list instead of creating one.'),
        dryRun,
    },
}, respond(write(args => addSelectionList(args))));

const list = z.string().describe('The inline list: CURIE (conceptscheme:… or collectie:…) or its name.');

server.registerTool('update_selection_list', {
    title: 'Edit an inline selection list',
    description:
        'Change the label/definition of an inline concept scheme or collection in <systeem>_eigenschappen.csv, and/or the ' +
        'label/definition of its options. Members of a collection are published concepts and cannot be edited here. ' +
        'To add entries use add_selection_list with extend=true; to remove them use remove_list_entries.',
    inputSchema: {
        system,
        list,
        set: z.object({
            prefLabel: prefLabel.optional(),
            definition: definition.nullable().optional(),
        }).default({}),
        options: z.array(z.object({
            option: z.string().describe('Option code or CURIE.'),
            prefLabel: prefLabel.optional(),
            definition: definition.nullable().optional(),
        })).default([]),
        dryRun,
    },
}, respond(write(args => updateSelectionList(args))));

server.registerTool('remove_list_entries', {
    title: 'Remove options or members from an inline list',
    description:
        'Remove options from an inline concept scheme (withdrawn after publication) or members from an inline collection. ' +
        'Refused while an option is referenced elsewhere, or when the list would become empty (use delete_selection_list).',
    inputSchema: {
        system,
        list,
        entries: z.array(z.string()).min(1).describe('Option codes/CURIEs of a concept scheme, or member CURIEs/URLs of a collection.'),
        dryRun,
    },
    annotations: destructive,
}, respond(write(args => removeListEntries(args))));

server.registerTool('delete_selection_list', {
    title: 'Delete an inline selection list',
    description:
        'Delete an inline concept scheme (with its options) or collection (with its membership rows) from ' +
        '<systeem>_eigenschappen.csv. Refused while an eigenschap still uses it as codeList or unit: update or delete that ' +
        'eigenschap first (delete_property with deleteUnusedLists=true does both). Published lists elsewhere cannot be deleted here.',
    inputSchema: { system, list, dryRun },
    annotations: destructive,
}, respond(write(args => deleteSelectionList(args))));

// ---------------------------------------------------------------------------
// Operationele gegevens: flows, steps and fields
// ---------------------------------------------------------------------------

server.registerTool('list_flows', {
    title: 'Operationele flows',
    description:
        'List the thematische stromen (thema_type.csv) with the steps of each flow. A flow starts at the thema, whose seeAlso ' +
        'is the first step (a concept scheme in operationeel_*.csv); fields with seeAlso lead to the next step. Also reports ' +
        'steps no thema reaches, option lists (used and unused) and operationeel_*.csv files missing from config.yml.',
    inputSchema: {},
    annotations: readOnly,
}, respond(() => listFlows()));

server.registerTool('get_flow', {
    title: 'Een flow bekijken',
    description:
        'The whole flow of a thema ("lucht", "thema:grondwater", "Zelfcontrole water") or starting at a step: a readable ' +
        '`outline` (steps, fields in display order, controls, required/repeatable, conditions, next steps, problems) and ' +
        'the full UI description of every step. Show the outline to the user.',
    inputSchema: { flow: z.string().describe('Thema (code, id, label or notation) or a step id.') },
    annotations: readOnly,
}, respond(args => getFlow(args)));

const step = z.string().describe('Step: concept scheme id (conceptscheme:operationeel_…) or its name (operationeel_lucht_bron or lucht_bron).');

server.registerTool('get_step', {
    title: 'Formulier van een stap',
    description:
        'UI description of one step: its fields in display order (_ui_first/_ui_after, conditional fields after their trigger) ' +
        'with control (select, feature-picker, number with unit, date-range, group, ...), required, repeatable, hidden, ' +
        'options, units, visibleWhen, variants (related), next step and data model mapping, plus which fields lead to it.',
    inputSchema: { step },
    annotations: readOnly,
}, respond(args => getStep(args)));

server.registerTool('get_flow_item', {
    title: 'Een thema, stap of veld in detail',
    description: 'The CSV record (file and line), the UI description and every row that refers to a thema, step, field or option.',
    inputSchema: { concept: z.string().describe('Id (e.g. lucht:brandstof), code or label.') },
    annotations: readOnly,
}, respond(args => getOperationalConcept(args)));

server.registerTool('validate_flows', {
    title: 'Validate operationele flows',
    description:
        'Quick check of thema_type.csv and operationeel_*.csv: seeAlso targets, conditions, parts, ordering (_ui_after siblings, ' +
        'cycles, several _ui_first), symmetric related, code lists, placeholders (http://TODO), unreachable steps, unused option ' +
        'lists and files missing from config.yml.',
    inputSchema: {},
    annotations: readOnly,
}, respond(() => validateFlows()));

const fieldSchema = {
    prefLabel: prefLabel.describe('Label shown in the form (Dutch, capital first letter).'),
    definition: z.string().describe('Help text / definition (Dutch).'),
    parent: z.string().describe('Composite field this is a part of (broaderPartitive); same step.'),
    datatype: z.enum(OPERATIONAL_DATATYPES).describe('relevantDataType: xsd:string (text), xsd:decimal/xsd:integer (number), xsd:boolean (checkbox), xsd:date, xsd:dateTime, xsd:duration, dcterms:temporal (period).'),
    relation: relation.describe('How the value maps onto the observation, e.g. qudt:numericValue, rdfs:label, rdfs:comment, sosa:hasResult, sosa:hasFeatureOfInterest, dcterms:type.'),
    codeList: codeList.describe('relevantCodeList: list to choose from (renders a select); e.g. conceptscheme:operationeel_peilmethode.'),
    unit: unit,
    relevantClass: z.string().describe('Class the field maps to: sosa:FeatureOfInterest (select the system to report on), riepr:ObservatieVerzameling (top-level report), riepr:Observatie, riepr:Resultaat, prov:Agent, ...'),
    relevantFeatureClass: z.array(z.string()).describe('relevantFeatureClass, e.g. riepr:Verbruik, riepr:Emissie, riepr:Onttrekking.'),
    relevantRiepr: z.array(z.string()).describe('Systems to select: types (emissiepunt:emissiepunt_lucht), type schemes, riepr:<Klasse> (riepr:Installatie), or an eigenschap (value taken from the selected system).'),
    seeAlso: z.array(z.string()).describe('Next step(s) after this field (concept scheme ids).'),
    conditionPath: z.string().describe('Field that controls the visibility of this field (same step).'),
    conditionValue: z.string().describe('Value of conditionPath for which this field is shown (an option id, or true/false for a checkbox).'),
    related: z.array(z.string()).describe('Variants of the same logical field (kept symmetric automatically).'),
    kwantiteitsAspect: z.string().describe('CSOR kwantificeerbaar aspect of the value, e.g. csor_kwantificeerbaaraspect:KWA_5 (vracht), KWA_1 (massaconcentratie).'),
    drager: z.string().describe('CSOR drager of the value, e.g. csor_drager:DR_1 (water), csor_drager:DR_8 (lucht).'),
    soortWaartbepaling: z.string().describe('CSOR soort waardebepaling, usually csor_soortwaardebepaling:SWB_1 (standaard).'),
    variabele: z.string().describe('Field of the same step where the stof (CSOR variabele) of this value is selected, e.g. water:lozing-stof.'),
    isVerplicht: z.boolean(),
    isMeervoudig: z.boolean().describe('May be added several times.'),
    isMultiselect: z.boolean(),
    isOnzichtbaar: z.boolean().describe('Hidden in the form (structural only).'),
    uiAfter: z.string().describe('Show directly after this sibling field (_ui_after).'),
    uiFirst: z.boolean().describe('Show first among its siblings (_ui_first).'),
};

server.registerTool('add_flow', {
    title: 'Nieuwe thematische stroom',
    description:
        'Create a new flow: a thema in thema_type.csv, a new src/source/operationeel_<code>.csv with its first step, the file ' +
        'in config.yml (source.codelijst_csv) and the id prefix <code>: in config.yml and README.md. Then add fields with add_field.',
    inputSchema: {
        code: z.string().describe('Lowercase with hyphens, e.g. "afval" or "zelfcontrole-afval"; becomes thema:<code> and the field prefix.'),
        prefLabel: prefLabel.describe('Name of the thema, e.g. "Afval".'),
        definition: definition.optional(),
        notation: z.string().optional().describe('Defaults to THEMA_<CODE>.'),
        stepLabel: z.string().optional().describe('Label of the first step; defaults to the thema label.'),
        dryRun,
    },
}, respond(write(args => addFlow(args))));

server.registerTool('add_step', {
    title: 'Stap toevoegen',
    description:
        'Add a step (concept scheme) to a flow file. With `from`, the given field (or thema) leads to it via seeAlso. ' +
        'Then add its fields with add_field.',
    inputSchema: {
        name: z.string().describe('snake_case, by convention operationeel_<flow>_<step>, e.g. operationeel_lucht_emissie.'),
        prefLabel: z.string().optional(),
        definition: z.string().optional(),
        from: z.string().optional().describe('Field or thema that leads to this step (sets its seeAlso).'),
        file: z.string().optional().describe('operationeel_*.csv to put it in; defaults to the file of `from`.'),
        replaceNext: z.boolean().default(false).describe('Replace an existing seeAlso of `from`.'),
        dryRun,
    },
}, respond(write(args => addStep(args))));

server.registerTool('add_field', {
    title: 'Veld toevoegen aan een stap',
    description:
        'Add a field (concept) to a step. Give a datatype (input), a codeList (select), relevantRiepr (system picker) or ' +
        'add parts later with parent=<this field> (group). Without uiFirst/uiAfter the field is shown last among its siblings. ' +
        'Conditions (conditionPath/conditionValue), variants (related) and the next step (seeAlso) are checked against the step.',
    inputSchema: {
        step,
        code: z.string().describe('Lowercase id part (a-z, 0-9, _ or -), e.g. brandstof_naam; the prefix follows the step.'),
        prefix: z.string().optional().describe('Id prefix, only when it cannot be derived from the step.'),
        ...Object.fromEntries(Object.entries(fieldSchema).map(([k, v]) => [k, k === 'prefLabel' ? v : v.optional()])) as {
            [K in keyof typeof fieldSchema]: K extends 'prefLabel' ? (typeof fieldSchema)[K] : z.ZodOptional<(typeof fieldSchema)[K]>
        },
        dryRun,
    },
}, respond(write(args => addField(args))));

server.registerTool('update_flow_item', {
    title: 'Thema, stap of veld aanpassen',
    description:
        'Change a field (any property of add_field), a step (prefLabel, definition) or a thema (prefLabel, definition, notation, ' +
        'seeAlso = first step). Only the keys in `set` change; null clears. Ids cannot change. Related variants stay symmetric.',
    inputSchema: {
        id: z.string().describe('Id of the thema, step or field.'),
        set: z.object({
            ...Object.fromEntries(Object.entries(fieldSchema).map(([k, v]) => [k, k === 'prefLabel' ? v.optional() : v.nullable().optional()])),
            notation: z.string().nullable().optional().describe('Thema only.'),
        }),
        dryRun,
    },
}, respond(write(args => updateFlowItem(args as Parameters<typeof updateFlowItem>[0]))));

server.registerTool('add_flow_collection', {
    title: 'Collectie voor een veld van een flow',
    description:
        'Create (or with extend=true, add members to) a collection of published concepts in operationeel_misc.csv, e.g. ' +
        'the CSOR variabelen (stoffen) a field may select. Id collectie:<name>; members are listed through the collections ' +
        'column. Then use it as codeList of the field with update_flow_item or add_field.',
    inputSchema: {
        name: z.string().describe('Name in snake_case (e.g. "operationeel_stoffen_water") or the full CURIE.'),
        prefLabel: prefLabel.optional().describe('Dutch label of the collection (required unless extend=true).'),
        definition: definition.optional(),
        members: z.array(z.string()).min(1).describe('CURIEs or URLs of published concepts, e.g. csor_variabele:V_424.'),
        extend: z.boolean().default(false),
        dryRun,
    },
}, respond(write(args => addFlowCollection(args))));

server.registerTool('reorder_fields', {
    title: 'Volgorde van velden',
    description:
        'Set the display order of the fields at one level of a step (top level, or the parts of `parent`) by rewriting ' +
        '_ui_first/_ui_after. `order` lists every sibling exactly once. Conditional fields always render after their trigger.',
    inputSchema: {
        step,
        parent: z.string().optional().describe('Composite field whose parts to reorder; omit for the top level.'),
        order: z.array(z.string()).min(1),
        dryRun,
    },
}, respond(write(args => reorderFields(args))));

server.registerTool('delete_field', {
    title: 'Veld verwijderen',
    description:
        'Delete a field with its parts. Refused while another row uses it (e.g. as conditionPath); the ordering of the ' +
        'remaining siblings and related variants are fixed automatically. Confirm with the user first.',
    inputSchema: { field: z.string(), dryRun },
    annotations: destructive,
}, respond(write(args => deleteField(args))));

server.registerTool('delete_step', {
    title: 'Stap verwijderen',
    description:
        'Delete a step with all its fields. Refused while other rows use it or its fields; seeAlso links to the step are ' +
        'removed with unlink=true. Confirm with the user first.',
    inputSchema: { step, unlink: z.boolean().default(false), dryRun },
    annotations: destructive,
}, respond(write(args => deleteStep(args))));

await server.connect(new StdioServerTransport());

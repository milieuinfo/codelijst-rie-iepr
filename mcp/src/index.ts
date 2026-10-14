#!/usr/bin/env node
// MCP server for querying and managing the systeemtype and eigenschappen code
// lists of codelijst-rie-iepr (src/source/<systeem>_type.csv and <systeem>_eigenschappen.csv).

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
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
            `code lists for the systems ${SYSTEMS.join(', ')}, including the inline selection lists they use. ` +
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
        '"directe stookinstallatie", "emissiepunt:fakkel") across all systems and returns every eigenschap that applies to it, ' +
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
        'Free-text search (case- and accent-insensitive) over types, eigenschappen and selection options of all six systems. ' +
        'Use it when a name does not resolve directly or to find where a term is used.',
    inputSchema: {
        query: z.string(),
        system: system.optional(),
        kind: z.enum(['all', 'type', 'property', 'option']).default('all'),
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
        '(every systeemtype so far is meetbaar); set isOnzichtbaar only for structural types users should not pick.',
    inputSchema: {
        system,
        code,
        prefLabel,
        definition,
        broader: z.string().optional().describe('Existing type this is a subtype of (code or CURIE, e.g. "schoorsteen").'),
        altLabel: z.string().optional(),
        scopeNote: z.string().optional(),
        isOnzichtbaar: z.boolean().default(false),
        isMeetbaar: z.boolean().default(true),
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
        'Top-level properties need appliesTo (relevantRiepr): the types they apply to, or "all".',
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

await server.connect(new StdioServerTransport());

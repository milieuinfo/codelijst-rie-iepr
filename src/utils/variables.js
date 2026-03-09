'use strict';
import yaml from 'js-yaml';
import fs, {readFileSync} from "fs";
import rdf from "@zazuko/env-node";
import {metadataOptions, shapes_dcat, dcat_rules, frame_catalog} from "@milieuinfo/maven-metadata-generator-npm/src/utils/variables.js";


const config = yaml.load(fs.readFileSync('./source/config.yml', 'utf8'));

const virtuoso = config.deploy.virtuoso ;

const prefixes = Object.assign( {}, config.skos.prefixes, config.prefixes, { '@base' : config.skos.prefixes.concept })

const context = JSON.parse(fs.readFileSync(config.source.path + config.source.context));

const context_prefixes = Object.assign({},context , prefixes)


const frame_skos_prefixes = {
    "@context": context_prefixes,
    "@type": ["rdfs:Resource", "skos:ConceptScheme", "skos:Concept", "http://qudt.org/schema/qudt/QuantityKind"],
    "member": {
        "@type": "skos:Concept",
        "@embed": "@never",
        "@omitDefault": true
    },
    "inScheme": {
        "@type": "skos:ConceptScheme",
        "@embed": "@never",
        "@omitDefault": true
    },
    "topConceptOf": {
        "@type": "skos:ConceptScheme",
        "@embed": "@never",
        "@omitDefault": true
    },
    "broader": {
        "@embed": "@never",
        "@omitDefault": true
    },
    "narrower": {
        "@type": "skos:Concept",
        "@embed": "@never",
        "@omitDefault": true
    },
    "hasTopConcept": {
        "@type": "skos:Concept",
        "@embed": "@never",
        "@omitDefault": true
    },
    "references":{
        "@embed": "@never",
            "@omitDefault": true
    },
    "isReferencedBy":{
        "@embed": "@never",
            "@omitDefault": true
    },
    "relation":{
        "@embed": "@never",
            "@omitDefault": true
    },
    "broaderTransitive" : {
        "@embed": "@never",
        "@omitDefault": true
    },
    "broadMatch" : {
        "@embed": "@never",
        "@omitDefault": true
    },
    "closeMatch" : {
        "@embed": "@never",
        "@omitDefault": true
    },
    "exactMatch" : {
        "@embed": "@never",
        "@omitDefault": true
    },
    "mappingRelation" : {
        "@embed": "@never",
        "@omitDefault": true
    },
    "narrowerTransitive" : {
        "@embed": "@never",
        "@omitDefault": true
    },
    "semanticRelation" : {
        "@embed": "@never",
        "@omitDefault": true
    },
    "narrowMatch" : {
        "@embed": "@never",
        "@omitDefault": true
    },
    "drager" : {
        "@embed": "@never",
        "@omitDefault": true
    },
    "relevantSystem" : {
        "@embed": "@never",
        "@omitDefault": true
    },
    "relevantQuantityKind" : {
        "@embed": "@never",
        "@omitDefault": true
    },
    "subject" : {
        "@embed": "@never",
        "@omitDefault": true
    },
    "relevantCodeList":  {
        "@embed": "@never",
        "@omitDefault": true
    },
    "relevantDataType":  {
        "@embed": "@never",
        "@omitDefault": true
    },
    "relevantLZS":  {
        "@embed": "@never",
        "@omitDefault": true
    },
    "hasProcedureForProperty":  {
        "@embed": "@never",
        "@omitDefault": true
    },
    "seeAlso":{
        "@embed": "@never",
        "@omitDefault": true
    },
    "relevantProperty": {
        "@embed": "@never",
        "@omitDefault": true
    },
    "normstatus": {
        "@embed": "@never",
        "@omitDefault": true
    },
    "actie": {
        "@embed": "@never",
        "@omitDefault": true
    },
    "dct_type": {
        "@embed": "@never",
        "@omitDefault": true
    },
    "intervalcategorie": {
        "@embed": "@never",
        "@omitDefault": true
    },


}


const frame_skos_no_prefixes = {
    "@context": context,
    "type": ["http://www.w3.org/2004/02/skos/core#ConceptScheme", "http://www.w3.org/2004/02/skos/core#Concept", "http://qudt.org/schema/qudt/QuantityKind"],
    "member": {
        "@type": "http://www.w3.org/2004/02/skos/core#Concept",
        "@embed": "@never",
        "@omitDefault": true
    },
    "inScheme": {
        "@embed": "@never",
        "@omitDefault": true
    },
    "dct_type": {
        "@embed": "@never",
        "@omitDefault": true
    },
    "applicableUnit": {
        "@embed": "@never",
        "@omitDefault": true
    },
    "topConceptOf": {
        "@embed": "@never",
        "@omitDefault": true
    },
    "broader": {
        "@embed": "@never",
        "@omitDefault": true
    },
    "narrower": {
        "@type": "http://www.w3.org/2004/02/skos/core#Concept",
        "@embed": "@never",
        "@omitDefault": true
    },
    "hasTopConcept": {
        "@type": "http://www.w3.org/2004/02/skos/core#Concept",
        "@embed": "@never",
        "@omitDefault": true
    },
    "references":{
        "@embed": "@never",
        "@omitDefault": true
    },
    "isReferencedBy":{
        "@embed": "@never",
        "@omitDefault": true
    },
    "relation":{
        "@type": "http://www.w3.org/2004/02/skos/core#Concept",
        "@embed": "@never",
        "@omitDefault": true
    },
    "broaderTransitive" : {
        "@type": "http://www.w3.org/2004/02/skos/core#Concept",
        "@embed": "@never",
        "@omitDefault": true
    },
    "broadMatch" : {
        "@type": "http://www.w3.org/2004/02/skos/core#Concept",
        "@embed": "@never",
        "@omitDefault": true
    },
    "closeMatch" : {
        "@type": "http://www.w3.org/2004/02/skos/core#Concept",
        "@embed": "@never",
        "@omitDefault": true
    },
    "exactMatch" : {
        "@type": "http://www.w3.org/2004/02/skos/core#Concept",
        "@embed": "@never",
        "@omitDefault": true
    },
    "mappingRelation" : {
        "@type": "http://www.w3.org/2004/02/skos/core#Concept",
        "@embed": "@never",
        "@omitDefault": true
    },
    "narrowerTransitive" : {
        "@type": "http://www.w3.org/2004/02/skos/core#Concept",
        "@embed": "@never",
        "@omitDefault": true
    },
    "narrowMatch" : {
        "@type": "http://www.w3.org/2004/02/skos/core#Concept",
        "@embed": "@never",
        "@omitDefault": true
    },

    "relevantSystem" : {
        "@type": "http://www.w3.org/2004/02/skos/core#Concept",
        "@embed": "@never",
        "@omitDefault": true
    },
    "semanticRelation" : {
        "@type": "http://www.w3.org/2004/02/skos/core#Concept",
        "@embed": "@never",
        "@omitDefault": true
    },
    "relevantQuantityKind" : {
        "@embed": "@never",
        "@omitDefault": true
    },
    "subject" : {
        "@embed": "@never",
        "@omitDefault": true
    },
    "relevantCodeList":  {
        "@embed": "@never",
        "@omitDefault": true
    },
    "relevantDataType":  {
        "@type": "http://www.w3.org/2004/02/skos/core#Concept",
        "@embed": "@never",
        "@omitDefault": true
    },
    "relevantLZS":  {
        "@embed": "@never",
        "@omitDefault": true
    },
    "hasProcedureForProperty":  {
        "@type": "http://www.w3.org/2004/02/skos/core#Concept",
        "@embed": "@never",
        "@omitDefault": true
    },

    "relevantUnit": {
        "@type": "http://www.w3.org/2004/02/skos/core#Concept",
        "@embed": "@never",
        "@omitDefault": true
    },
    "relevantProperty": {
        "@type": "http://www.w3.org/2004/02/skos/core#Concept",
        "@embed": "@never",
        "@omitDefault": true
    },
    "normstatus": {
        "@embed": "@never",
        "@omitDefault": true
    },
    "actie": {
        "@embed": "@never",
        "@omitDefault": true
    },
    "severity": {
        "@embed": "@never",
        "@omitDefault": true
    },
    "intervalcategorie": {
        "@embed": "@never",
        "@omitDefault": true
    },
    "seeAlso":{
        "@embed": "@never",
        "@omitDefault": true
    }
}



const xsdOptions = {"file": config.skos.path + config.skos.name + '/' + config.skos.name + config.skos.xsd, "urn": ('urn:' + metadataOptions.groupId + ':' + metadataOptions.artifactId)}

const turtlePath = config.skos.path + config.skos.name + '/' + config.skos.name + config.skos.turtle

const ntriplesPath = config.skos.path + config.skos.name + '/' + config.skos.name + config.skos.nt

const jsonldOptions = {"file": config.skos.path + config.skos.name + '/' + config.skos.name + config.skos.jsonld, "frame": frame_skos_prefixes}

const csvOptions = {"file": config.skos.path + config.skos.name + '/' + config.skos.name + config.skos.csv, "frame": frame_skos_no_prefixes}

const jsonOptions = {"file": config.skos.path + config.skos.name + '/' + config.skos.name + config.skos.json, "frame": frame_skos_no_prefixes}

const parquetOptions = {"file": config.skos.path + config.skos.name + '/' + config.skos.name + config.skos.parquet, "frame": frame_skos_no_prefixes}

const excelOptions = {"file": config.skos.path + config.skos.name + '/' + config.skos.name + config.skos.xlsx,
    "sourcefile": config.skos.path + config.skos.name + '/' + config.skos.name + config.skos.csv,
    "sheetName": config.types}

const skos_prefixes = Object.assign( {}, config.skos.prefixes, config.prefixes, { '@base' : config.skos.prefixes.concept })

const skos_context = JSON.parse(readFileSync(config.source.path + config.source.context));

const dcat_dataset_jsonld = '../temp/' + config.dcat.path_dataset + metadataOptions.artifactId + '/' + config.dcat.dataset_jsonld

const dcat_dataset_turtle = '../temp/' + config.dcat.path_dataset + metadataOptions.artifactId + '/' + config.dcat.dataset_turtle

const dcat_catalog_jsonld = '../temp/' + config.dcat.path_catalog + metadataOptions.artifactId + '/' + config.dcat.catalog_jsonld

const dcat_catalog_turtle = '../temp/' + config.dcat.path_catalog + metadataOptions.artifactId + '/' + config.dcat.catalog_turtle

const datasetOptions = {
    "turtlePath": dcat_dataset_turtle,
    "jsonldOptions": {"file": dcat_dataset_jsonld, "frame": frame_catalog}
}

const catalogOptions = {
    "turtlePath": dcat_catalog_turtle,
    "jsonldOptions": {"file": dcat_catalog_jsonld, "frame": frame_catalog}
}

const skosOptions = {
    "turtlePath": turtlePath,
    "jsonOptions": jsonOptions,
    "jsonldOptions": jsonldOptions,
    "ntriplesPath": ntriplesPath,
    "csvOptions": csvOptions,
    "parquetOptions": parquetOptions,
    "excelOptions": excelOptions,
    //"xsdOptions": xsdOptions
}

const skosSource = {
    "sourcePath": config.source.path + config.source.codelijst_csv,
    "contextPrefixes": Object.assign({},skos_context , skos_prefixes),
    "rules": config.skos.rules,
    "shapesDataset": await rdf.dataset().import(rdf.fromFile(config.ap.path + config.ap.name + '-' + config.ap.type + '/' + config.ap.name + '-' + config.ap.type + config.ap.turtle)),
    "prefixes": Object.assign( {}, config.skos.prefixes, config.prefixes)
}

const metadataSource = {
    "shapesDataset": shapes_dcat,
    "rules": dcat_rules,
    "prefixes": config.prefixes
}


export {
    virtuoso,
    skosOptions,
    skosSource,
    metadataSource,
    metadataOptions,
    datasetOptions,
    catalogOptions
};
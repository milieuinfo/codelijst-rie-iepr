#!/usr/bin/env python3
"""
Update operationeel CSV files with XSD datatypes, QUDT units, and relevantCodeList
based on the IMJV JSON data. Cleans _id values to be URI-safe.
"""

import json
import csv
import re
from pathlib import Path

# Load the IMJV JSON data
with open('imjv_gegevenslijst.json', 'r', encoding='utf-8') as f:
    imjv_data = json.load(f)

# XSD type mapping from IMJV types
XSD_TYPE_MAP = {
    'heel getal': 'http://www.w3.org/2001/XMLSchema#integer',
    'geheel getal': 'http://www.w3.org/2001/XMLSchema#integer',
    'geheel getal of continue metingen': 'http://www.w3.org/2001/XMLSchema#integer',
    'decimaal getal': 'http://www.w3.org/2001/XMLSchema#decimal',
    'getal': 'http://www.w3.org/2001/XMLSchema#decimal',
    'numeriek veld': 'http://www.w3.org/2001/XMLSchema#decimal',
    '%': 'http://www.w3.org/2001/XMLSchema#decimal',
    'percentage': 'http://www.w3.org/2001/XMLSchema#decimal',
    'vrije tekst': 'http://www.w3.org/2001/XMLSchema#string',
    'tekst': 'http://www.w3.org/2001/XMLSchema#string',
    'vrij tekstveld': 'http://www.w3.org/2001/XMLSchema#string',
    'lijst': 'http://www.w3.org/2001/XMLSchema#string',
    'uit lijst': 'http://www.w3.org/2001/XMLSchema#string',
    'één uit lijst': 'http://www.w3.org/2001/XMLSchema#string',
    'lijst?': 'http://www.w3.org/2001/XMLSchema#string',
    'lijst (nat of droog)': 'http://www.w3.org/2001/XMLSchema#string',
    'lijst (gemeten, berekend, geschat)': 'http://www.w3.org/2001/XMLSchema#string',
    'jaartal': 'http://www.w3.org/2001/XMLSchema#gYear',
    'datum': 'http://www.w3.org/2001/XMLSchema#date',
}

# QUDT unit mapping based on context clues
def get_qudt_unit(gegeven, vvoorwerp, type_imjv):
    """Determine QUDT unit based on given name and context."""
    if not gegeven:
        return ''
    
    gegeven_lower = gegeven.lower()
    
    # Volume units
    if any(kw in gegeven_lower for kw in ['m3', 'kubieke meter', 'verbruik', 'debiet', 'hoeveelheid']):
        if 'water' in gegeven_lower or 'onttrek' in gegeven_lower or 'verbruik' in gegeven_lower:
            return 'http://qudt.org/vocab/unit/M3'
    
    # Mass units
    if any(kw in gegeven_lower for kw in ['vracht', 'massa', 'kg', 'ton', 'emissie']):
        if 'ton' in gegeven_lower:
            return 'http://qudt.org/vocab/unit/TON'
        return 'http://qudt.org/vocab/unit/KILO_GRAM'
    
    # Temperature units
    if any(kw in gegeven_lower for kw in ['temperatuur', '°c', 'graden']):
        return 'http://qudt.org/vocab/unit/DEG_C'
    
    # Percentage units
    if any(kw in gegeven_lower for kw in ['%', 'aandeel', 'rendement', 'zwavel', 'asgehalte', 'vocht', 'zuurstof']):
        return 'http://qudt.org/vocab/unit/PERCENT'
    
    # Length units
    if any(kw in gegeven_lower for kw in ['diepte', 'hoogte', 'diameter', 'meter', 'm ']):
        return 'http://qudt.org/vocab/unit/M'
    
    # Time units
    if 'uur' in gegeven_lower and ('duur' in gegeven_lower or 'uren' in gegeven_lower):
        return 'http://qudt.org/vocab/unit/HOUR'
    if 'dag' in gegeven_lower:
        return 'http://qudt.org/vocab/unit/DAY'
    
    # Concentration units
    if any(kw in gegeven_lower for kw in ['concentratie', 'mg/', 'mg/nm']):
        return 'http://qudt.org/vocab/unit/MG-PER-L'
    
    return ''

# Code list mappings
def get_relevant_code_list(gegeven, type_imjv):
    """Determine relevantCodeList based on given name and type."""
    if not gegeven or type_imjv not in ['lijst', 'uit lijst', 'één uit lijst', 'lijst?']:
        return ''
    
    gegeven_lower = gegeven.lower()
    
    # Chemical substances
    if any(kw in gegeven_lower for kw in ['stof', 'verontreinigend', 'broeikasgas', 'chemisch']):
        return 'conceptscheme:chemische_stof'
    
    # Water source
    if 'herkomst' in gegeven_lower and 'water' in gegeven_lower:
        return 'conceptscheme:water_herkomst'
    
    # Emission type
    if 'emissietype' in gegeven_lower or any(kw in gegeven_lower for kw in ['geleide', 'abnormaal', 'not-geleid']):
        return 'conceptscheme:emissietype'
    
    # Measurement method
    if 'meetmethode' in gegeven_lower or 'bepalingsmethode' in gegeven_lower:
        return 'conceptscheme:bepalingsmethode'
    
    # NOSE-P codes
    if 'nose-p' in gegeven_lower:
        return 'conceptscheme:nose_p_codes'
    
    # Activity type
    if 'activiteit' in gegeven_lower or 'stoffunctie' in gegeven_lower:
        return 'conceptscheme:activiteit_type'
    
    return ''

# Clean _id to be URI-safe
def clean_id(text):
    """Clean text to be URI-safe: no double dashes, no invalid URI characters."""
    if not text:
        return ''
    
    # Convert to lowercase
    text = text.lower()
    
    # Replace spaces with dashes
    text = re.sub(r'\s+', '-', text)
    
    # Remove invalid URI characters (keep alphanumeric, dashes, underscores, dots)
    text = re.sub(r'[^a-z0-9\-_.]', '', text)
    
    # Remove double or more dashes
    text = re.sub(r'-{2,}', '-', text)
    
    # Remove leading/trailing dashes
    text = text.strip('-')
    
    return text

# RIEPR type references
RIEPR_TYPES = {
    'controleinrichting': 'https://data.omgeving.vlaanderen.be/id/concept/riepr/meetpunt-type/controleinrichting',
    'peilput': 'https://data.omgeving.vlaanderen.be/id/concept/riepr/meetpunt-type/peilput',
    'meetinrichting': 'https://data.omgeving.vlaanderen.be/id/concept/riepr/meetpunt-type/meetinrichting',
    'pompput': 'https://data.omgeving.vlaanderen.be/id/concept/riepr/onttrekkingspunt-type/pompput',
    'emissiepunt': 'https://data.omgeving.vlaanderen.be/id/concept/riepr/emissiepunt-type/emissiepunt',
    'schoorsteen': 'https://data.omgeving.vlaanderen.be/id/concept/riepr/emissiepunt-type/schoorsteen',
    'stookinstallatie': 'https://data.omgeving.vlaanderen.be/id/concept/riepr/installatie-type/stookinstallatie',
    'waterzuivering': 'https://data.omgeving.vlaanderen.be/id/concept/riepr/installatie-type/waterzuivering',
}

def get_riepr_ref(vvoorwerp):
    """Get RIEPR type reference based on voorwerp name."""
    if not vvoorwerp:
        return ''
    
    vvoorwerp_lower = vvoorwerp.lower()
    
    for key, url in RIEPR_TYPES.items():
        if key in vvoorwerp_lower:
            return url
    
    return ''

def generate_updated_csv(target_file, imjv_items):
    """Generate updated CSV with datatypes, units, and code lists."""
    headers = [
        '_id', '_type', 'inScheme', 'topConceptOf', 'prefLabel', 'altLabel', 'notation',
        'definition', 'scopeNote', 'broader', 'relation', 'relevantDataType',
        'relevantCodeList', 'relevantRiepr', 'relevantProperty', 'relevantQuantityKind',
        'relevantUnit', 'applicableUnit', 'isVerplicht', 'isMeervoudig'
    ]
    
    rows = []
    seen_ids = set()
    
    # Add ConceptScheme header
    scheme_id = f'conceptscheme:{target_file}'
    if scheme_id not in seen_ids:
        rows.append({
            '_id': scheme_id,
            '_type': 'skos:ConceptScheme',
            'inScheme': '',
            'topConceptOf': '',
            'prefLabel': 'Operationele gegevens',
            **{h: '' for h in headers if h not in ['_id', '_type', 'inScheme', 'topConceptOf', 'prefLabel']}
        })
        seen_ids.add(scheme_id)
    
    # Group items by v1_voorwerp (type)
    from collections import defaultdict
    types_groups = defaultdict(list)
    for item in imjv_items:
        vvoorwerp = item.get('v1_voorwerp')
        if vvoorwerp and vvoorwerp != '-' and vvoorwerp != 'geen_type':
            types_groups[vvoorwerp].append(item)
    
    # Generate top-level concepts for each type
    type_concept_ids = {}
    file_prefix = target_file.replace('operationeel_', '')
    for vvoorwerp, items in types_groups.items():
        clean_name = clean_id(vvoorwerp)
        concept_id = f"riepr-{file_prefix}:{clean_name}"
        if concept_id not in seen_ids:
            type_concept_ids[vvoorwerp] = concept_id
            seen_ids.add(concept_id)
            
            riepr_ref = get_riepr_ref(vvoorwerp)
            
            rows.append({
                '_id': concept_id,
                '_type': 'skos:Concept',
                'inScheme': scheme_id,
                'topConceptOf': scheme_id,
                'prefLabel': vvoorwerp,
                'altLabel': '',
                'notation': f"{file_prefix}-{clean_name}",
                'definition': f'Type: {vvoorwerp}',
                'scopeNote': 'IMJV operationeel gegeven type',
                **{h: '' for h in headers if h not in ['_id', '_type', 'inScheme', 'topConceptOf', 'prefLabel', 'notation', 'definition', 'scopeNote']},
                'relevantRiepr': riepr_ref
            })
    
    # Generate property concepts with datatypes
    for vvoorwerp, items in types_groups.items():
        parent_id = type_concept_ids.get(vvoorwerp)
        if not parent_id:
            continue
        
        # Get the scheme_id for this type (same as top-level concept's scheme)
        scheme_id = f'conceptscheme:{target_file}'
        
        for item in items:
            gegeven = item.get('gegeven_juridisch_functioneel', '')
            veldnaam = item.get('v1_veldnaam', '')
            type_imjv = item.get('type', '')
            
            if not veldnaam or veldnaam == '-':
                continue
            
            # Clean the ID
            clean_id_str = clean_id(veldnaam)
            base_concept_id = f"riepr-{target_file.replace('operationeel_', '')}:{clean_id_str}"
            
            # Handle duplicate IDs by adding suffix
            concept_id = base_concept_id
            if concept_id in seen_ids:
                # Add suffix based on given name to make it unique
                suffix = clean_id(gegeven) if gegeven else clean_id(veldnaam) + '-2'
                concept_id = f"{base_concept_id}-{suffix}"
            seen_ids.add(concept_id)
            
            # Generate unique notation (must be unique per SHACL constraint across all files)
            # Use target_file prefix to ensure cross-file uniqueness
            file_prefix = target_file.replace('operationeel_', '')
            notation_value = f"{file_prefix}-{clean_id_str}"
            if concept_id != base_concept_id:
                # For duplicate IDs, use a more specific notation
                notation_value = f"{file_prefix}-{clean_id_str}-{clean_id(gegeven) if gegeven else 'variant'}"
            
            # Get XSD type (handle None and string variations)
            if type_imjv and str(type_imjv).strip() not in ['None', '']:
                # Clean up the type string (remove quotes if present)
                type_clean = str(type_imjv).strip().strip("'\"")
                xsd_type = XSD_TYPE_MAP.get(type_clean, '')
            else:
                xsd_type = ''
            
            # Get QUDT unit
            qudt_unit = get_qudt_unit(gegeven, vvoorwerp, type_imjv)
            
            # Get relevant code list
            relevant_code_list = get_relevant_code_list(gegeven, type_imjv)
            
            # Get RIEPR reference
            riepr_ref = get_riepr_ref(vvoorwerp)
            
            rows.append({
                '_id': concept_id,
                '_type': 'skos:Concept',
                'inScheme': scheme_id,
                'topConceptOf': '',
                'prefLabel': gegeven if gegeven else veldnaam,
                'altLabel': '',
                'notation': notation_value,
                'definition': gegeven or '',
                'scopeNote': item.get('detailgraad', ''),
                'broader': parent_id,
                'relation': '',
                'relevantDataType': xsd_type,
                'relevantCodeList': relevant_code_list,
                'relevantRiepr': riepr_ref,
                'relevantProperty': '',
                'relevantQuantityKind': '',
                'relevantUnit': qudt_unit,
                'applicableUnit': '',
                'isVerplicht': '',
                'isMeervoudig': ''
            })
    
    return rows, headers

def filter_empty_columns(rows, headers):
    """Remove columns that are empty for all rows."""
    # Find columns with at least one non-empty value
    active_columns = []
    for header in headers:
        has_value = False
        for row in rows:
            if row.get(header, '').strip():
                has_value = True
                break
        if has_value:
            active_columns.append(header)
    return active_columns

def write_csv(filepath, rows, headers):
    """Write rows to CSV file, removing empty columns."""
    # Filter out empty columns
    active_headers = filter_empty_columns(rows, headers)
    
    with open(filepath, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=active_headers, extrasaction='ignore')
        writer.writeheader()
        writer.writerows(rows)
    print(f"✓ Written {len(rows)} rows to {filepath}")
    print(f"  Columns: {', '.join(active_headers)}")

def main():
    import sys
    
    # Parse command line arguments
    json_file = 'imjv_gegevenslijst.json'
    output_dir = Path('../src/source')
    
    # Check for --json parameter
    if '--json' in sys.argv:
        json_idx = sys.argv.index('--json')
        if json_idx + 1 < len(sys.argv):
            json_file = sys.argv[json_idx + 1]
    
    print(f"Using JSON file: {json_file}")
    
    # Load the specified JSON data
    with open(json_file, 'r', encoding='utf-8') as f:
        imjv_data = json.load(f)
    
    # Process each target file
    for target_file in ['operationeel_grondwater', 'operationeel_lucht', 'operationeel_water']:
        imjv_items = imjv_data['operationeel_gegevens'][target_file]
        rows, headers = generate_updated_csv(target_file, imjv_items)
        
        csv_path = output_dir / f'{target_file}.csv'
        write_csv(csv_path, rows, headers)
    
    print("\n✓ All CSV files updated successfully!")

if __name__ == '__main__':
    main()

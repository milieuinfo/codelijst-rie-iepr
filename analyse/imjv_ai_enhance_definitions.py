#!/usr/bin/env python3
"""
Enhance SKOS concepts using AI (OpenAI compatible endpoint).
Processes each concept and returns updated JSON with improved prefLabel, definition, scopeNote.

Usage:
    python imjv_ai_enhance_definitions.py [input_json] [output_json]

Example:
    python imjv_ai_enhance_definitions.py imjv_gegevenslijst.json imjv_gegevenslijst_ai.json
"""

import json
import sys
import time
import requests
import re
from pathlib import Path

# AI Configuration
AI_ENDPOINT = "http://192.168.1.5:18080/v1"
AI_MODEL = "qwen2.5:3b"
AI_MAX_TOKENS = 4096
AI_TEMPERATURE = 0.3

# Expected JSON schema keys for operationeel_gegevens items
EXPECTED_KEYS = {
    'row_number', 'thema', 'soort', 'frequentie', 'bvr_tekst_of_bijlage',
    'gegeven_juridisch_functioneel', 'type', 'detailgraad', 'v1', 'v1_deel',
    'v1_sectie', 'v1_voorwerp', 'v1_veldnaam', 'v2', 'v2_voorwerp',
    'v2_veldnaam', 'vmjj_veldnaam', 'rechtsgrond', 'rie', 'iepr',
    'unece_prtr', 'nec_lrtap', 'unfccc_co2mmr', 'luchtbeleid',
    'waterbeleid_en_weiss', 'handhaving', 'motivering_gebruik', 'opmerking',
    'vlarem'
}

def load_json(filepath):
    """Load JSON file."""
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)

def validate_schema(data):
    """Validate that JSON has the expected structure."""
    errors = []
    
    # Check top-level keys
    if 'operationeel_gegevens' not in data:
        errors.append("Missing 'operationeel_gegevens' key")
        return errors
    
    op_data = data['operationeel_gegevens']
    required_files = ['operationeel_grondwater', 'operationeel_lucht', 'operationeel_water']
    
    for file_key in required_files:
        if file_key not in op_data:
            errors.append(f"Missing '{file_key}' in operationeel_gegevens")
            continue
        
        items = op_data[file_key]
        if not isinstance(items, list):
            errors.append(f"'{file_key}' is not a list")
            continue
        
        # Check first item for expected keys
        if len(items) > 0:
            item_keys = set(items[0].keys())
            missing_keys = EXPECTED_KEYS - item_keys
            extra_keys = item_keys - EXPECTED_KEYS
            
            if missing_keys:
                errors.append(f"{file_key}: Missing keys {missing_keys}")
            if extra_keys:
                print(f"  Note: {file_key} has extra keys (not an error): {extra_keys}")
    
    return errors

def save_json(filepath, data):
    """Save JSON file."""
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"✓ Saved output to {filepath}")

def get_imjv_context(imjv_data, target_file, item):
    """Extract relevant context from IMJV data for a specific item."""
    vvoorwerp = item.get('v1_voorwerp', '')
    gegeven = item.get('gegeven_juridisch_functioneel', '')
    veldnaam = item.get('v1_veldnaam', '')
    type_imjv = item.get('type', '')
    detailgraad = item.get('detailgraad', '')
    
    # Build context string
    context = f"""Target File: {target_file}
Parent Type (v1_voorwerp): {vvoorwerp}
Given Name (gegeven_juridisch_functioneel): {gegeven}
Field Name (v1_veldnaam): {veldnaam}
Type (type): {type_imjv}
Detail Degree (detailgraad): {detailgraad}"""
    
    return context

def enhance_concept_with_ai(imjv_data, target_file, item):
    """Use AI to enhance the concept (prefLabel, definition, scopeNote) based on IMJV source data."""
    context = get_imjv_context(imjv_data, target_file, item)
    
    current_preflabel = item.get('v1_veldnaam', '')
    current_definition = item.get('definition', '')
    
    prompt = f"""You are a SKOS codelist expert. Create SHORT, CLEAR Dutch terms for environmental data fields.

CONTEXT FROM IMJV SPECIFICATION:
{context}

CURRENT FIELD NAME (v1_veldnaam): "{current_preflabel}"

TASK: Return JSON with EXACTLY these rules:

{{
  "prefLabel": "SHORT Dutch term (MAX 5 words, e.g., 'Waterverbruik' NOT 'Waterverbruik van de installatie')",
  "definition": "ONE sentence explanation (MAX 100 chars, e.g., 'Hoeveelheid water per jaar')",
  "scopeNote": "Optional usage note (MAX 80 chars, omit if not needed)"
}}

STRICT RULES:
1. prefLabel: MAX 5 words. Use standard terms like 'Jaaremissie', 'Meetwaarde', 'Bepalingsmethode'
2. definition: MAX 100 CHARACTERS total. ONE sentence only.
3. scopeNote: MAX 80 CHARACTERS. Omit if unnecessary.
4. NO long descriptions, NO lists, NO examples in definition
5. Return ONLY valid JSON

Example output:
{{
  "prefLabel": "Waterverbruik",
  "definition": "Totale waterhoeveelheid geïntroduceerd of verwijderd per jaar"
}}"""

    try:
        response = requests.post(
            f"{AI_ENDPOINT}/chat/completions",
            json={
                "model": AI_MODEL,
                "messages": [
                    {"role": "system", "content": "You are a technical documentation expert for environmental data codelists (RIE-IEPR). Return JSON with prefLabel, definition, and scopeNote in Dutch."},
                    {"role": "user", "content": prompt}
                ],
                "max_tokens": AI_MAX_TOKENS,
                "temperature": AI_TEMPERATURE
            },
            timeout=180
        )
        
        if response.status_code == 200:
            result = response.json()
            ai_response = result['choices'][0]['message']['content'].strip()
            
            # Try to extract JSON from response
            try:
                # First try direct parse
                enhanced = json.loads(ai_response)
            except json.JSONDecodeError:
                # Try to find JSON in response (might have markdown code blocks)
                json_match = re.search(r'\{[\s\S]*\}', ai_response)
                if json_match:
                    try:
                        enhanced = json.loads(json_match.group())
                    except json.JSONDecodeError:
                        print(f"  ⚠ Could not parse AI response as JSON")
                        # Debug: show first 200 chars of response
                        print(f"    Response preview: {ai_response[:200]}")
                        return None
                else:
                    print(f"  ⚠ Could not find JSON in AI response")
                    print(f"    Response preview: {ai_response[:200]}")
                    return None
            
            # Validate AI response has expected fields
            ai_keys = set(enhanced.keys())
            valid_ai_keys = {'prefLabel', 'definition', 'scopeNote'}
            
            if not ai_keys.issubset(valid_ai_keys):
                print(f"  ⚠ AI response has invalid keys: {ai_keys - valid_ai_keys}")
                return None
            
            if 'definition' not in enhanced:
                print(f"  ⚠ AI response missing 'definition' field")
                return None
            
            # Validate all values are strings
            for key, value in enhanced.items():
                if not isinstance(value, str):
                    print(f"  ⚠ AI response '{key}' is not a string: {type(value)}")
                    return None
            
            return enhanced
            
    except Exception as e:
        print(f"  ⚠ AI request failed: {e}")
        return None

def process_items(imjv_data, target_file):
    """Process all items for a target file and enhance concepts."""
    items = imjv_data.get('operationeel_gegevens', {}).get(target_file, [])
    print(f"\nProcessing {target_file} ({len(items)} items)...")
    
    enhanced_count = 0
    skipped_count = 0
    
    for i, item in enumerate(items):
        veldnaam = item.get('v1_veldnaam', '')
        gegeven = item.get('gegeven_juridisch_functioneel', '')
        
        if not veldnaam or veldnaam == '-':
            continue
        
        current_def = item.get('definition', '')
        
        # Skip top-level type concepts (they have "Type: ..." definitions)
        if current_def.startswith('Type:'):
            skipped_count += 1
            continue
        
        # Skip items with good definitions (longer than 30 chars and meaningful)
        if current_def and len(current_def) > 30 and current_def != gegeven:
            skipped_count += 1
            continue
        
        # Enhance concept with AI
        enhanced = enhance_concept_with_ai(imjv_data, target_file, item)
        
        if enhanced:
            # Update the item in the JSON structure
            if 'prefLabel' in enhanced and enhanced['prefLabel']:
                item['prefLabel'] = enhanced['prefLabel']
            
            if 'definition' in enhanced and enhanced['definition']:
                item['definition'] = enhanced['definition']
            
            if 'scopeNote' in enhanced and enhanced['scopeNote']:
                item['scopeNote'] = enhanced['scopeNote']
            
            enhanced_count += 1
            print(f"  [{i+1}/{len(items)}] {veldnaam}:")
            print(f"    Definition: '{enhanced.get('definition', '')[:60]}...'")
            if 'scopeNote' in enhanced:
                print(f"    ScopeNote: '{enhanced['scopeNote'][:60]}...'")
        else:
            skipped_count += 1
        
        # Small delay to avoid overwhelming the API
        time.sleep(1.0)
    
    print(f"  Enhanced: {enhanced_count}, Skipped: {skipped_count}")
    return items

def compare_schemas(input_data, output_data):
    """Compare input and output schemas to ensure they match."""
    print("\nSchema Comparison:")
    
    for target_file in ['operationeel_grondwater', 'operationeel_lucht', 'operationeel_water']:
        if target_file not in input_data.get('operationeel_gegevens', {}):
            continue
            
        input_items = input_data['operationeel_gegevens'][target_file]
        output_items = output_data.get('operationeel_gegevens', {}).get(target_file, [])
        
        if len(input_items) != len(output_items):
            print(f"  ⚠ {target_file}: Item count mismatch (input: {len(input_items)}, output: {len(output_items)})")
            continue
        
        # Check each item has same keys
        for i, (inp_item, out_item) in enumerate(zip(input_items, output_items)):
            inp_keys = set(inp_item.keys())
            out_keys = set(out_item.keys())
            
            if inp_keys != out_keys:
                missing = inp_keys - out_keys
                extra = out_keys - inp_keys
                print(f"  ⚠ {target_file}[{i}]: Keys mismatch - Missing: {missing}, Extra: {extra}")
                break
        else:
            print(f"  ✓ {target_file}: Schema matches ({len(input_items)} items)")

def main():
    # Parse command line arguments
    input_file = 'imjv_gegevenslijst.json'
    output_file = 'imjv_gegevenslijst_ai.json'
    
    if len(sys.argv) > 1:
        input_file = sys.argv[1]
    if len(sys.argv) > 2:
        output_file = sys.argv[2]
    
    print(f"Input: {input_file}")
    print(f"Output: {output_file}")
    print(f"AI Endpoint: {AI_ENDPOINT}")
    print(f"AI Model: {AI_MODEL}")
    
    # Load input JSON
    imjv_data = load_json(input_file)
    
    # Validate input schema
    print("\nValidating input schema...")
    errors = validate_schema(imjv_data)
    if errors:
        print("❌ Schema validation failed:")
        for error in errors:
            print(f"  - {error}")
        sys.exit(1)
    else:
        print("✓ Input schema is valid")
    
    # Process each target file
    for target_file in ['operationeel_grondwater', 'operationeel_lucht', 'operationeel_water']:
        if target_file in imjv_data.get('operationeel_gegevens', {}):
            items = process_items(imjv_data, target_file)
            imjv_data['operationeel_gegevens'][target_file] = items
    
    # Validate output schema
    print("\nValidating output schema...")
    errors = validate_schema(imjv_data)
    if errors:
        print("❌ Schema validation failed:")
        for error in errors:
            print(f"  - {error}")
        sys.exit(1)
    else:
        print("✓ Output schema is valid")
    
    # Save output JSON
    save_json(output_file, imjv_data)
    
    # Compare schemas
    original_data = load_json(input_file)
    compare_schemas(original_data, imjv_data)
    
    print("\n✓ AI enhancement complete!")

if __name__ == '__main__':
    main()

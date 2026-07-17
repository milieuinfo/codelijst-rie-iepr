#!/usr/bin/env python3
"""
Fix prefLabels and URIs to be short and clean.
- prefLabel: MAX 5 words
- URI (_id): Remove definition text, keep only core concept name
"""

import json
import re
import sys
from pathlib import Path

def shorten_preflabel(text, max_words=5):
    """Shorten text to max_words words, removing articles."""
    if not text:
        return text
    
    # Remove @nl suffix for processing
    has_lang_tag = '@nl' in text
    text_clean = text.replace('@nl', '').strip()
    
    # Remove leading articles (de, het, een) for cleaner labels
    articles = ['de ', 'het ', 'een ']
    for article in articles:
        if text_clean.lower().startswith(article):
            text_clean = text_clean[len(article):]
            break
    
    words = text_clean.split()
    if len(words) <= max_words:
        # Re-add proper capitalization
        shortened = ' '.join(words)
        if shortened[0].islower():
            shortened = shortened[0].upper() + shortened[1:]
        result = shortened
    else:
        # Take first max_words words
        shortened = ' '.join(words[:max_words])
        result = shortened
    
    if has_lang_tag:
        return f"{result}@nl"
    return result

def clean_id_from_preflabel(preflabel):
    """Generate a clean URI-safe ID from prefLabel."""
    if not preflabel:
        return "concept"
    
    # Remove @nl and extra spaces
    text = preflabel.replace('@nl', '').strip()
    
    # Convert to lowercase
    text = text.lower()
    
    # Replace spaces and special chars with dashes
    text = re.sub(r'[^a-z0-9\-]', '', text)
    
    # Remove leading/trailing dashes and collapse multiple dashes
    text = re.sub(r'-+', '-', text)
    text = text.strip('-')
    
    return text if text else "concept"

def fix_csv_file(csv_path):
    """Fix prefLabels and _id in a CSV file."""
    import csv
    
    print(f"\nProcessing: {csv_path.name}")
    
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        rows = list(reader)
    
    fixed_count = 0
    
    for row in rows:
        old_preflabel = row.get('prefLabel', '')
        old_id = row.get('_id', '')
        
        # Skip type concepts (top concepts with "Type:" definition)
        def_text = row.get('definition', '')
        if def_text.startswith('Type:'):
            continue
        
        # Skip if no prefLabel
        if not old_preflabel or old_preflabel == '-':
            continue
        
        # Shorten prefLabel
        new_preflabel = shorten_preflabel(old_preflabel, max_words=5)
        
        if new_preflabel != old_preflabel:
            row['prefLabel'] = new_preflabel
            
            # Generate new clean _id from shortened prefLabel
            new_id = clean_id_from_preflabel(new_preflabel)
            
            # Add file prefix to avoid duplicates
            file_prefix = csv_path.stem.replace('operationeel_', '')
            new_id = f"{file_prefix}-{new_id}"
            
            row['_id'] = new_id
            
            # Also fix notation to match
            old_notation = row.get('notation', '')
            if old_notation and len(old_notation) > 50:  # Only fix if notation is too long
                row['notation'] = f"{file_prefix}-{new_id}"
            
            fixed_count += 1
    
    # Write back
    with open(csv_path, 'w', newline='', encoding='utf-8') as f:
        if rows:
            writer = csv.DictWriter(f, fieldnames=rows[0].keys(), extrasaction='ignore')
            writer.writeheader()
            writer.writerows(rows)
    
    print(f"  Fixed {fixed_count} concepts")

def main():
    source_dir = Path('../src/source')
    
    for csv_file in ['operationeel_grondwater.csv', 'operationeel_lucht.csv', 'operationeel_water.csv']:
        csv_path = source_dir / csv_file
        if csv_path.exists():
            fix_csv_file(csv_path)
        else:
            print(f"Warning: {csv_path} not found")

if __name__ == '__main__':
    main()

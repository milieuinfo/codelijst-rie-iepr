#!/usr/bin/env python3
"""
Fix long notations in CSV files to match the _id pattern.
"""

import csv
import re
from pathlib import Path

def clean_notation(old_notation, file_prefix):
    """Generate a clean short notation from _id or prefLabel."""
    if not old_notation:
        return old_notation
    
    # If notation is already short (< 50 chars), keep it
    if len(old_notation) < 50:
        return old_notation
    
    # Extract the core part after file_prefix-
    if old_notation.startswith(f"{file_prefix}-"):
        core = old_notation[len(f"{file_prefix}-"):]
    else:
        core = old_notation
    
    # If core is still too long, truncate it intelligently
    if len(core) > 50:
        # Try to keep meaningful words
        words = core.split('-')
        kept = []
        total_len = 0
        for word in words:
            if total_len + len(word) + (1 if kept else 0) <= 50:
                kept.append(word)
                total_len += len(word) + 1
            else:
                break
        core = '-'.join(kept)
    
    return f"{file_prefix}-{core}"

def fix_notations(csv_path):
    """Fix long notations in a CSV file."""
    print(f"\nProcessing: {csv_path.name}")
    
    file_prefix = csv_path.stem.replace('operationeel_', '')
    
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        rows = list(reader)
    
    # First pass: fix all notations
    fixed_count = 0
    seen_notations = {}  # Track used notations to avoid duplicates
    
    for row in rows:
        old_notation = row.get('notation', '')
        old_id = row.get('_id', '')
        
        # Skip schemes and empty notations
        if not old_notation or old_notation == '-' or 'conceptscheme:' in old_id:
            continue
        
        # Fix long notations
        new_notation = clean_notation(old_notation, file_prefix)
        
        # Check for duplicates - add suffix if needed
        base_notation = new_notation
        counter = 1
        while new_notation in seen_notations:
            new_notation = f"{base_notation}-{counter}"
            counter += 1
        
        seen_notations[new_notation] = True
        
        if new_notation != old_notation:
            row['notation'] = new_notation
            fixed_count += 1
    
    # Write back
    with open(csv_path, 'w', newline='', encoding='utf-8') as f:
        if rows:
            writer = csv.DictWriter(f, fieldnames=rows[0].keys(), extrasaction='ignore')
            writer.writeheader()
            writer.writerows(rows)
    
    print(f"  Total fixed: {fixed_count}")

def main():
    source_dir = Path('../src/source')
    
    for csv_file in ['operationeel_grondwater.csv', 'operationeel_lucht.csv', 'operationeel_water.csv']:
        csv_path = source_dir / csv_file
        if csv_path.exists():
            fix_notations(csv_path)
        else:
            print(f"Warning: {csv_path} not found")

if __name__ == '__main__':
    main()

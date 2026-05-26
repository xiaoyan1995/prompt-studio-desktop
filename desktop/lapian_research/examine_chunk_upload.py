import os
import re

file_path = r'h:\AI提示词\资产\prompt_studio\prompt_studio_desktop\desktop\lapian_research\QlHmieW4.js'
if os.path.exists(file_path):
    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
    
    print("=== JS CHUNK ANALYSIS (QlHmieW4.js) ===")
    print("File size:", len(content), "chars")
    
    # Let's extract any function names, endpoints, or blocks that look interesting
    # and print them beautifully!
    print("\n--- Raw JavaScript Content (First 4000 chars) ---")
    print(content[:4000])
    
    print("\n--- Search for progress / polling logic inside this file ---")
    # Let's print out lines around 'progress', 'task', 'status', 'interval'
    for kw in ['progress', 'task', 'status', 'interval', 'polling', 'video-segments']:
        for m in [m.start() for m in re.finditer(kw, content, re.IGNORECASE)][:5]:
            start = max(0, m - 150)
            end = min(len(content), m + 150)
            print(f"\n[Keyword: {kw} at {m}]:\n...{content[start:end]}...")
else:
    print("QlHmieW4.js does not exist.")

import os

file_path = r'h:\AI提示词\资产\prompt_studio\prompt_studio_desktop\desktop\lapian_research\scraped_lapian_116.txt'
if os.path.exists(file_path):
    print("File size:", os.path.getsize(file_path), "bytes")
    with open(file_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
        print("Total lines:", len(lines))
        for idx, line in enumerate(lines[:30]):
            print(f"[{idx}] {line.strip()[:150]}")
else:
    print("File doesn't exist.")

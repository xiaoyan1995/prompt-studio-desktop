import os
import re

dir_path = os.path.dirname(os.path.abspath(__file__))
print("Scanning JavaScript chunks inside:", dir_path)

# Keywords we want to search for
keywords = [
    r'user-api\/[a-zA-Z0-9_\-\/]+',
    r'upload',
    r'assistant',
    r'scene',
    r'shot',
    r'task',
    r'status',
    r'interval',
    r'polling',
    r'FormData'
]

for filename in os.listdir(dir_path):
    if filename.endswith('.js') and filename != 'reverse_lapian.js' and filename != 'fetch_api_directly.js':
        file_path = os.path.join(dir_path, filename)
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
            
            # Check for general keywords
            found_endpoints = re.findall(r'user-api/[a-zA-Z0-9_\-\/]+', content)
            found_endpoints = list(set(found_endpoints))
            
            found_upload = 'FormData' in content or 'uploadFile' in content or 'upload-large' in content
            found_assistant_route = 'assistant' in content or '拉片助手' in content
            
            if found_endpoints or found_upload or found_assistant_route:
                print(f"\n--- FILE: {filename} ---")
                if found_endpoints:
                    print("  * Endpoints:", found_endpoints)
                if found_upload:
                    print("  * Contains Upload (FormData/uploadFile)")
                if found_assistant_route:
                    print("  * Contains Assistant Page keywords (assistant/拉片助手)")
                
                # Print a small snippet around 'FormData' or 'upload' or API endpoints
                for kw in ['FormData', 'upload', 'user-api']:
                    match = re.search(re.escape(kw), content)
                    if match:
                        start = max(0, match.start() - 150)
                        end = min(len(content), match.end() + 150)
                        print(f"  * Snippet around '{kw}': ...{content[start:end]}...")

print("\nScan completed.")

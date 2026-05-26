import re
from bs4 import BeautifulSoup

file_path = r'h:\AI提示词\资产\prompt_studio\prompt_studio_desktop\desktop\lapian_research\assistant_dom.html'
with open(file_path, 'r', encoding='utf-8') as f:
    html = f.read()

soup = BeautifulSoup(html, 'html.parser')

print("=== ASSISTANT DOM ANALYSIS ===")

# 1. Find all buttons and links
print("\n--- Buttons & Clickable Elements ---")
for btn in soup.find_all(['button', 'a']):
    btn_text = btn.get_text().strip()
    btn_class = btn.get('class', [])
    btn_id = btn.get('id', '')
    if btn_text:
        print(f"[{btn.name}] class={btn_class} id={btn_id} | Text: {btn_text}")

# 2. Find file upload forms and drag drop targets
print("\n--- File Inputs & Upload Elements ---")
for inp in soup.find_all('input'):
    print(f"[input] type={inp.get('type')} id={inp.get('id')} name={inp.get('name')} accept={inp.get('accept')}")

# Check any drag-drop triggers or upload-related divs
for div in soup.find_all('div', class_=re.compile(r'(upload|drag|drop|click|picker|select|helper)')):
    div_class = div.get('class', [])
    div_text = div.get_text().strip()[:100]
    if div_text:
        print(f"[div] class={div_class} | Sample: {div_text}")

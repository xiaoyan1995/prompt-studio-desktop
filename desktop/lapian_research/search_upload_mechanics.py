from bs4 import BeautifulSoup

file_path = r'h:\AI提示词\资产\prompt_studio\prompt_studio_desktop\desktop\lapian_research\assistant_dom.html'
with open(file_path, 'r', encoding='utf-8') as f:
    html = f.read()

soup = BeautifulSoup(html, 'html.parser')

print("=== SEARCHING UPLOAD MECHANICS ===")

# Search for the button-upload-large and print its surrounding HTML (its parent, siblings, and children)
btn = soup.find(class_='btn-upload-large')
if btn:
    print("\n--- btn-upload-large HTML Context ---")
    parent = btn.parent
    print("Parent Tag:", parent.name, "Classes:", parent.get('class', []))
    print("Button HTML:\n", btn.prettify()[:1000])
    
    # Print the parent's full HTML to see hidden file inputs
    print("\nParent HTML Structure:\n", parent.prettify()[:2000])
else:
    print("Could not find class 'btn-upload-large'")

# Search for any input tag in general
print("\n--- All Input Tags ---")
all_inputs = soup.find_all('input')
print("Total input tags found:", len(all_inputs))
for i, inp in enumerate(all_inputs):
    print(f"[{i}] Tag: {inp.name} | Attrs: {inp.attrs}")

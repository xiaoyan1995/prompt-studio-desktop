"""诊断 TransNetV2 切点概率 — 修改 VIDEO_PATH 后运行"""
import sys, cv2, numpy as np
import onnxruntime as ort

VIDEO_PATH = r"H:\AI提示词\资产\prompt_studio\prompt_studio_desktop\studio-data\uploads\测试\videos\jimeng-2026-05-08-4047-高端体育商业大片风格_电影级光影_超写实主义_强烈动态.mp4"
MODEL_PATH = r"h:\AI提示词\资产\prompt_studio\prompt_studio_desktop\desktop\studio\transnetv2.onnx"

sess = ort.InferenceSession(MODEL_PATH, providers=["CPUExecutionProvider"])
input_name = sess.get_inputs()[0].name

cap = cv2.VideoCapture(VIDEO_PATH)
fps = cap.get(cv2.CAP_PROP_FPS)
frames = []
while True:
    ret, f = cap.read()
    if not ret: break
    f = cv2.resize(f, (48, 27))
    f = cv2.cvtColor(f, cv2.COLOR_BGR2RGB)
    frames.append(f)
cap.release()

arr   = np.array(frames, dtype=np.uint8)
total = len(arr)
n_pad_start = 25
n_pad_end   = 25 + 50 - (total % 50 if total % 50 != 0 else 50)
padded = np.concatenate([
    np.repeat(arr[:1],  n_pad_start, axis=0),
    arr,
    np.repeat(arr[-1:], n_pad_end,   axis=0),
], axis=0)

single_preds = []
ptr = 0
while ptr + 100 <= len(padded):
    chunk = padded[ptr:ptr + 100]
    inp   = chunk[np.newaxis].astype(np.float32)
    res   = sess.run(None, {input_name: inp})
    single_preds.append(res[0][0, 25:75, 0])
    ptr  += 50

preds = np.concatenate(single_preds)[:total]

print(f"\n视频: {total} 帧, {fps:.1f} fps, {total/fps:.2f}s\n")
print("── Top 15 最高概率帧 ──────────────────")
for i in np.argsort(preds)[::-1][:15]:
    bar = "█" * int(preds[i] * 30)
    print(f"  帧 {i:4d}  {i/fps:6.2f}s  {preds[i]:.4f}  {bar}")

print("\n── 所有 > 0.3 的帧 ────────────────────")
for i in np.where(preds > 0.3)[0]:
    print(f"  帧 {i:4d}  {i/fps:6.2f}s  {preds[i]:.4f}")

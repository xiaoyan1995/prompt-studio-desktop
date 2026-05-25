export type HookCategory = "stunt" | "subtle" | "cinematic";

export interface HookTemplate {
  id: string;
  titleKey: string;
  descKey: string;
  promptEn: string;
  promptZh: string;
  category: HookCategory;
  previewUrl?: string;
}

export const HOOK_TEMPLATES: HookTemplate[] = [
  // ── Stunt hooks ──────────────────────────────────────
  {
    id: "product-hit",
    titleKey: "hookProductHit",
    descKey: "hookProductHitDesc",
    category: "stunt",
    previewUrl: "/marketing-preview/product-hit.mp4",
    promptEn: "A {product} flies into the frame and hits the person in the hand. Brief shocked reaction, then they flip the product around, examine it, and smoothly pivot into a casual product review.",
    promptZh: "{product} 飞入画面击中人物的手。短暂惊讶反应后，翻转产品仔细端详，然后自然过渡到轻松的产品评测。",
  },
  {
    id: "product-crash",
    titleKey: "hookProductCrash",
    descKey: "hookProductCrashDesc",
    category: "stunt",
    previewUrl: "/marketing-preview/product-crash.mp4",
    promptEn: "The {product} falls from above and shatters on the table, creating dramatic chaos; a harsh cut leads to a perfectly clean and restored scene where a person calmly picks up the intact {product} and begins reviewing it as if nothing happened.",
    promptZh: "{product} 从高处坠落摔碎在桌上，场面混乱；一个硬切后画面恢复整洁，一个人淡定地拿起完好的 {product} 开始评测，仿佛什么都没发生。",
  },
  {
    id: "product-dodge",
    titleKey: "hookProductDodge",
    descKey: "hookProductDodgeDesc",
    category: "stunt",
    previewUrl: "/marketing-preview/product-dodge.mp4",
    promptEn: "Suddenly, the {product} flies toward the person's face at high speed; they duck to dodge it, and in the next frame stand up straight already holding the {product} in their hands, beginning to review it as if nothing happened.",
    promptZh: "{product} 突然高速飞向人物面部；他们迅速低头躲避，下一帧已经站直，手中稳稳拿着 {product}，若无其事地开始评测。",
  },
  {
    id: "epic-fail",
    titleKey: "hookEpicFail",
    descKey: "hookEpicFailDesc",
    category: "stunt",
    previewUrl: "/marketing-preview/epic-fail.mp4",
    promptEn: "A person attempts an impressive backflip but lands badly and falls; without any pause they immediately pull out the {product} and begin an absolutely unflappable, deadpan review from the ground.",
    promptZh: "一个人尝试炫酷的后空翻但落地失败摔倒在地；毫无停顿地立刻掏出 {product}，以面无表情的状态在地上开始一本正经的评测。",
  },
  {
    id: "random-object-mic",
    titleKey: "hookRandomMic",
    descKey: "hookRandomMicDesc",
    category: "stunt",
    previewUrl: "/marketing-preview/random-object-mic.mp4",
    promptEn: "During a casual vlog, a random absurd object falls into the person's hand from above; they immediately use it as a microphone to continue a completely serious review of the {product}.",
    promptZh: "日常 Vlog 拍摄中，一个荒诞的物品从天而降落入手中；此人立刻把它当麦克风，一本正经地继续评测 {product}。",
  },
  {
    id: "blizzard",
    titleKey: "hookBlizzard",
    descKey: "hookBlizzardDesc",
    category: "stunt",
    previewUrl: "/marketing-preview/blizzard.mp4",
    promptEn: "A cozy indoor scene is suddenly hit by a violent, impossible blizzard; chaos fills the room, objects fly everywhere, but the {product} remains perfectly intact and functioning. Once the storm stops, the person casually picks it up and shows it still works flawlessly.",
    promptZh: "温馨的室内场景突然遭遇不可能的猛烈暴风雪；房间一片混乱，物品四处飞散，但 {product} 始终完好无损。风暴停止后，人物淡定地拿起它，展示依然完美运作。",
  },
  {
    id: "camera-bump",
    titleKey: "hookCameraBump",
    descKey: "hookCameraBumpDesc",
    category: "stunt",
    previewUrl: "/marketing-preview/camera-bump.mp4",
    promptEn: "The camera operator accidentally bumps into the person, hitting their forehead; they react briefly with surprise, recover composure, and naturally reveal the {product} while transitioning into a casual explanation of its features.",
    promptZh: "摄影师不小心撞到人物额头；短暂惊讶后恢复镇定，自然地展示出 {product}，流畅过渡到对产品特性的轻松讲解。",
  },

  // ── Subtle hooks ─────────────────────────────────────
  {
    id: "spicy-reveal",
    titleKey: "hookSpicyReveal",
    descKey: "hookSpicyRevealDesc",
    category: "subtle",
    previewUrl: "/marketing-preview/spicy-reveal.mp4",
    promptEn: "The shot starts with an extreme close-up that slowly tilts up to reveal a stylish look, then pulls back into selfie framing. A brief silent pause creates tension before naturally pivoting into a pitch for the {product}.",
    promptZh: "镜头从极致特写开始缓慢上移，展现时尚造型，然后拉远到自拍构图。一段短暂的沉默制造悬念，随后自然过渡到 {product} 的介绍。",
  },
  {
    id: "interview-stranger",
    titleKey: "hookInterview",
    descKey: "hookInterviewDesc",
    category: "subtle",
    previewUrl: "/marketing-preview/interview-stranger.mp4",
    promptEn: "A street interviewer asks a stranger a completely random question; confusion builds until the person naturally notices the {product} and pivots into a genuine, casual review as if they just discovered it.",
    promptZh: "街头采访者向路人提出一个完全随机的问题；困惑逐渐积累，直到此人自然注意到 {product}，然后像是刚发现一样，转入真诚随性的评测。",
  },
  {
    id: "asmr-unbox",
    titleKey: "hookAsmrUnbox",
    descKey: "hookAsmrUnboxDesc",
    category: "subtle",
    previewUrl: "/marketing-preview/asmr-unbox.mp4",
    promptEn: "Extreme close-up ASMR-style: hands slowly unwrap luxurious packaging, fingers trace the texture of the box, peel back tissue paper. The {product} is revealed with a satisfying visual moment. Soft ambient lighting, no face shown.",
    promptZh: "ASMR 风格极致特写：双手缓慢拆开精美包装，手指触摸盒子纹理，揭开薄纸。{product} 以令人满足的视觉呈现登场。柔和环境光，不露脸。",
  },
  {
    id: "morning-routine",
    titleKey: "hookMorningRoutine",
    descKey: "hookMorningRoutineDesc",
    category: "subtle",
    previewUrl: "/marketing-preview/morning-routine.mp4",
    promptEn: "Golden hour morning light streams through a window. A person goes through their calm morning routine — stretching, coffee, getting ready — and the {product} appears as an effortless, natural part of their daily ritual.",
    promptZh: "金色晨光透过窗户洒入。一个人进行平静的晨间日常——伸展、咖啡、整理——{product} 作为日常仪式中毫不刻意的一部分自然出现。",
  },
  {
    id: "pov-discovery",
    titleKey: "hookPovDiscovery",
    descKey: "hookPovDiscoveryDesc",
    category: "subtle",
    previewUrl: "/marketing-preview/pov-discovery.mp4",
    promptEn: "First-person POV: camera looks down at a desk cluttered with everyday items. A hand reaches in and picks up the {product}, turns it over curiously. Cut to the person's face showing genuine delight as they start explaining why they love it.",
    promptZh: "第一人称视角：镜头俯视堆满日常物品的桌面。一只手伸入画面拿起 {product}，好奇地翻转端详。切到人物面部，展现发自内心的喜悦，开始讲述为什么喜欢它。",
  },

  // ── Cinematic hooks ──────────────────────────────────
  {
    id: "time-freeze",
    titleKey: "hookTimeFreeze",
    descKey: "hookTimeFreezeDesc",
    category: "cinematic",
    previewUrl: "/marketing-preview/time-freeze.mp4",
    promptEn: "A busy city scene with people walking, cars passing. Everything suddenly freezes mid-motion. Camera slowly orbits around the frozen scene and pushes in on the {product} sitting in the center, perfectly lit. Time resumes as someone picks it up.",
    promptZh: "繁忙城市场景，行人穿梭、车辆驶过。一切突然在运动中凝固。镜头在冻结的场景中缓慢环绕，推进到画面中央完美打光的 {product}。有人拿起它的瞬间，时间恢复流动。",
  },
  {
    id: "macro-world",
    titleKey: "hookMacroWorld",
    descKey: "hookMacroWorldDesc",
    category: "cinematic",
    previewUrl: "/marketing-preview/macro-world.mp4",
    promptEn: "Extreme macro photography reveals the {product} as a vast landscape — its surface textures become mountains and valleys. Camera flies over this miniature world like a drone shot, then rapidly zooms out to reveal a person holding the tiny {product} in their palm.",
    promptZh: "极致微距摄影将 {product} 展现为广阔的风景——表面纹理化为山脉与峡谷。镜头如无人机般在这个微观世界上空飞行，随后迅速拉远，展现一个人手掌中的小小 {product}。",
  },
  {
    id: "split-screen-life",
    titleKey: "hookSplitScreen",
    descKey: "hookSplitScreenDesc",
    category: "cinematic",
    previewUrl: "/marketing-preview/split-screen-life.mp4",
    promptEn: "Split screen: left side shows a chaotic, stressful daily scene; right side shows the same moment but calm and elevated. The dividing line sweeps across as the {product} is introduced, transforming the chaotic side into the premium side.",
    promptZh: "分屏对比：左侧是混乱、焦虑的日常场景；右侧是同一时刻的从容与精致。随着 {product} 的出现，分割线扫过，将混乱的一侧转变为精致的一侧。",
  },
  {
    id: "dolly-zoom-reveal",
    titleKey: "hookDollyZoom",
    descKey: "hookDollyZoomDesc",
    category: "cinematic",
    previewUrl: "/marketing-preview/dolly-zoom-reveal.mp4",
    promptEn: "Hitchcock-style dolly zoom: the background warps and shifts while the person in the center stays perfectly still, holding the {product}. The disorienting visual effect creates instant tension and draws all attention to the product.",
    promptZh: "希区柯克式推拉变焦：背景扭曲变形，而画面中央的人纹丝不动，手持 {product}。迷幻的视觉效果制造即时张力，将所有注意力引向产品。",
  },
  {
    id: "one-take-transition",
    titleKey: "hookOneTake",
    descKey: "hookOneTakeDesc",
    category: "cinematic",
    previewUrl: "/marketing-preview/one-take-transition.mp4",
    promptEn: "Seamless one-take transition: camera follows a person walking through a door, but each door leads to a completely different environment — office, beach, mountain top — and in every scene the {product} is the one constant element.",
    promptZh: "无缝一镜到底转场：镜头跟随人物穿过一扇门，但每扇门通向完全不同的环境——办公室、海滩、山顶——而 {product} 是每个场景中唯一不变的元素。",
  },
];

export function resolveHookPrompt(
  hook: HookTemplate,
  productName: string,
  locale: string,
): string {
  const template = locale === "zh" ? hook.promptZh : hook.promptEn;
  return template.replace(/\{product\}/g, productName);
}

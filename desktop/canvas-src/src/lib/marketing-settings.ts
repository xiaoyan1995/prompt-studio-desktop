export type SettingCategory = "realistic" | "unrealistic";

export interface SettingTemplate {
  id: string;
  titleKey: string;
  descKey: string;
  promptEn: string;
  promptZh: string;
  category: SettingCategory;
  previewUrl?: string;
}

export const SETTING_TEMPLATES: SettingTemplate[] = [
  // ── Realistic settings ───────────────────────────────
  {
    id: "bedroom",
    titleKey: "settingBedroom",
    descKey: "settingBedroomDesc",
    category: "realistic",
    previewUrl: "/marketing-preview/bedroom.mp4",
    promptEn: "On bed or propped against pillows, soft window light. Unmade bed, cozy textures. Relaxed morning or evening wind-down vibe — honest, low-effort feel.",
    promptZh: "床上或靠在枕头上，柔和窗光。凌乱的被褥、舒适质感。放松的晨间或晚间收尾氛围——真实、不刻意的感觉。",
  },
  {
    id: "nature",
    titleKey: "settingNature",
    descKey: "settingNatureDesc",
    category: "realistic",
    previewUrl: "/marketing-preview/nature.mp4",
    promptEn: "Outdoors — trail, park, beach, or garden depending on product. Natural light, greenery or open sky. Active or peaceful mood — setting adapts to product.",
    promptZh: "户外——步道、公园、海滩或花园，根据产品而定。自然光线，绿意或开阔天空。活力或平和的氛围——场景适应产品。",
  },
  {
    id: "gym",
    titleKey: "settingGym",
    descKey: "settingGymDesc",
    category: "realistic",
    previewUrl: "/marketing-preview/gym.mp4",
    promptEn: "Gym floor, locker room, or post-workout bench. Bright overhead lighting, equipment in background. Sweaty or freshly finished energy — product tied to performance or recovery.",
    promptZh: "健身房地板、更衣室或运动后的长椅。明亮的顶灯，器材在背景中。汗水或刚结束的运动能量——产品与表现或恢复相关。",
  },
  {
    id: "bathroom",
    titleKey: "settingBathroom",
    descKey: "settingBathroomDesc",
    category: "realistic",
    previewUrl: "/marketing-preview/bathroom.mp4",
    promptEn: "Mirror selfie or front camera in bathroom. Ring light or vanity lighting, tiles visible. Intimate getting-ready energy — product shown mid-routine, close-up friendly.",
    promptZh: "浴室镜面自拍或前置摄像头。环形灯或化妆台灯光，可见瓷砖。亲密的准备出门能量——产品在日常中展示，适合特写。",
  },
  {
    id: "kitchen",
    titleKey: "settingKitchen",
    descKey: "settingKitchenDesc",
    category: "realistic",
    previewUrl: "/marketing-preview/kitchen.mp4",
    promptEn: "Standing at counter or leaning on island, natural daylight. Clean surface, mug or fruit in background. Casual mid-day energy — product fits daily routine.",
    promptZh: "站在台面旁或靠在中岛上，自然日光。干净台面，杯子或水果在背景中。随性的日间能量——产品融入日常。",
  },
  {
    id: "in-car",
    titleKey: "settingInCar",
    descKey: "settingInCarDesc",
    category: "realistic",
    previewUrl: "/marketing-preview/in-car.mp4",
    promptEn: "Selfie from passenger or driver seat, parked or cruising. Window light on face. Casual tone — talking to camera between errands.",
    promptZh: "副驾或驾驶位自拍，停车或行驶中。窗光照在脸上。随意的语气——出差途中对着镜头聊天。",
  },
  {
    id: "street",
    titleKey: "settingStreet",
    descKey: "settingStreetDesc",
    category: "realistic",
    previewUrl: "/marketing-preview/street.mp4",
    promptEn: "Walking on sidewalk or standing on urban street, handheld selfie. City backdrop — storefronts, traffic, pedestrians. Energetic pace, talking while moving. Spontaneous discovery feel.",
    promptZh: "在人行道上行走或站在城市街头，手持自拍。城市背景——店面、车流、行人。充满活力的节奏，边走边说。自发发现的感觉。",
  },
  {
    id: "office",
    titleKey: "settingOffice",
    descKey: "settingOfficeDesc",
    category: "realistic",
    previewUrl: "/marketing-preview/office.mp4",
    promptEn: "Desk setup, laptop open, coffee nearby. Clean modern space, soft overhead or monitor glow. Hushed mid-workday tone — quick product mention squeezed between tasks.",
    promptZh: "办公桌布局，笔记本打开，咖啡在旁。干净的现代空间，柔和顶灯或屏幕光。工作日中压低的语调——任务间隙快速提及产品。",
  },
  {
    id: "cafe",
    titleKey: "settingCafe",
    descKey: "settingCafeDesc",
    category: "realistic",
    previewUrl: "/marketing-preview/cafe.mp4",
    promptEn: "Cozy café corner, warm ambient lighting, coffee steam visible. Background chatter, wooden tables, plants. Relaxed intellectual vibe — product appears naturally on the table.",
    promptZh: "温馨咖啡馆角落，暖色环境光，可见咖啡蒸汽。背景聊天声，木桌，绿植。放松的知性氛围——产品自然出现在桌上。",
  },
  {
    id: "living-room",
    titleKey: "settingLivingRoom",
    descKey: "settingLivingRoomDesc",
    category: "realistic",
    previewUrl: "/marketing-preview/living-room.mp4",
    promptEn: "Couch or armchair, TV glow in background, warm lamp lighting. Blanket, cushions, snacks nearby. Evening unwind energy — product is part of relaxation ritual.",
    promptZh: "沙发或扶手椅，背景有电视光，暖色灯光。毯子、靠垫、零食在旁。晚间放松能量——产品是放松仪式的一部分。",
  },

  // ── Unrealistic settings ─────────────────────────────
  {
    id: "airplane-wing",
    titleKey: "settingAirplaneWing",
    descKey: "settingAirplaneWingDesc",
    category: "unrealistic",
    previewUrl: "/marketing-preview/airplane-wing.mp4",
    promptEn: "Person sits on airplane wing mid-flight at altitude. Casual product review — powerful wind, clouds, engine roar. Completely unbothered.",
    promptZh: "人坐在高空飞行中的机翼上。轻松的产品评测——强风、云层、引擎轰鸣。完全不在意。",
  },
  {
    id: "rooftop",
    titleKey: "settingRooftop",
    descKey: "settingRooftopDesc",
    category: "unrealistic",
    previewUrl: "/marketing-preview/rooftop.mp4",
    promptEn: "Person on the edge of a skyscraper rooftop, city skyline stretched out behind, wind moving through hair, sun catching the buildings. Casual product review with the entire city below, completely unbothered by the height — selfie camera, golden hour or dusk.",
    promptZh: "人站在摩天大楼顶边缘，城市天际线在身后延展，风吹发丝，阳光映在建筑上。整座城市在脚下的轻松产品评测，完全不在意高度——自拍镜头，黄金时段或黄昏。",
  },
  {
    id: "volcano-rim",
    titleKey: "settingVolcanoRim",
    descKey: "settingVolcanoRimDesc",
    category: "unrealistic",
    previewUrl: "/marketing-preview/volcano-rim.mp4",
    promptEn: "Person sits on active volcano rim, lava below. Casual product review — lava bubbles, smoke drifts through, zero reaction.",
    promptZh: "人坐在活火山口边缘，下方是岩浆。轻松的产品评测——岩浆冒泡、烟雾飘过，零反应。",
  },
  {
    id: "tiny-reviewer",
    titleKey: "settingTinyReviewer",
    descKey: "settingTinyReviewerDesc",
    category: "unrealistic",
    previewUrl: "/marketing-preview/tiny-reviewer.mp4",
    promptEn: "Person shrunk to 15cm next to a product their full height. Normal selfie review at impossible scale — leans on the product, walks around it.",
    promptZh: "人缩小到15厘米，产品与其等身大。在不可能的比例下进行正常的自拍评测——靠在产品上，绕着它走。",
  },
  {
    id: "car-roof",
    titleKey: "settingCarRoof",
    descKey: "settingCarRoofDesc",
    category: "unrealistic",
    previewUrl: "/marketing-preview/car-roof.mp4",
    promptEn: "Person on roof of moving car, desert highway, golden hour. Product review while swaying with the road. Semi truck passes — no flinch.",
    promptZh: "人在行驶中汽车的车顶上，沙漠公路，黄金时段。随路摇摆中评测产品。半挂卡车驶过——毫不畏惧。",
  },
  {
    id: "train-surf",
    titleKey: "settingTrainSurf",
    descKey: "settingTrainSurfDesc",
    category: "unrealistic",
    previewUrl: "/marketing-preview/train-surf.mp4",
    promptEn: "Person hangs outside a moving train, filming selfie. Reviews product — wind pressing on them is the live demo.",
    promptZh: "人挂在行驶中火车外侧，拍摄自拍。评测产品——风压就是实时演示。",
  },
  {
    id: "underwater",
    titleKey: "settingUnderwater",
    descKey: "settingUnderwaterDesc",
    category: "unrealistic",
    previewUrl: "/marketing-preview/underwater.mp4",
    promptEn: "Person sitting cross-legged on the ocean floor, light rays filtering through water above. Fish swim past casually. Calm product review as if breathing underwater is normal — bubbles rise with each word.",
    promptZh: "人盘腿坐在海底，光线从上方水面透入。鱼悠然游过。平静地评测产品，仿佛在水下呼吸是正常的——每说一个字都有气泡升起。",
  },
  {
    id: "space-station",
    titleKey: "settingSpaceStation",
    descKey: "settingSpaceStationDesc",
    category: "unrealistic",
    previewUrl: "/marketing-preview/space-station.mp4",
    promptEn: "Inside a space station, zero gravity. Product floats in front of person, Earth visible through the window. Casual review while items drift past — completely routine tone.",
    promptZh: "在空间站内部，零重力。产品漂浮在人面前，窗外可见地球。物品飘过时轻松评测——完全日常的语气。",
  },
];

export function resolveSettingPrompt(
  setting: SettingTemplate,
  locale: string,
): string {
  return locale === "zh" ? setting.promptZh : setting.promptEn;
}
